// src/server/services/AuthService.ts
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { DatabaseManager } from '../storage/DatabaseManager';
import { EmailService, EmailConfig } from './EmailService';

// Конфигурация JWT
export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiresIn: string;      // например '15m'
  refreshExpiresIn: string;     // например '7d'
}

// Конфигурация безопасности
export interface SecurityConfig {
  maxLoginAttempts: number;      // Максимум попыток входа
  lockoutDurationMinutes: number; // Длительность блокировки
  passwordMinLength: number;     // Минимальная длина пароля
  requireStrongPassword: boolean; // Требовать сложный пароль
  sessionTimeoutDays: number;    // Таймаут сессии
  rateLimitWindowMinutes: number; // Окно rate limiting
  rateLimitMaxRequests: number;   // Максимум запросов в окно
}

// Данные пользователя
export interface PilotCredentials {
  playerId: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  isEmailVerified: boolean;
  isAccountLocked: boolean;
  lockUntil: Date | null;
  failedLoginAttempts: number;
}

// Токены
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Результат входа
export interface LoginResult {
  success: boolean;
  tokens?: TokenPair;
  error?: string;
  requiresEmailVerification?: boolean;
  requiresIpConfirmation?: boolean;
}

/**
 * Сервис авторизации пилотов
 */
export class AuthService {
  private db: DatabaseManager;
  private emailService: EmailService;
  private jwtConfig: JwtConfig;
  private securityConfig: SecurityConfig;

  constructor(
    db: DatabaseManager,
    emailService: EmailService,
    jwtConfig: JwtConfig,
    securityConfig: SecurityConfig
  ) {
    this.db = db;
    this.emailService = emailService;
    this.jwtConfig = jwtConfig;
    this.securityConfig = securityConfig;
  }

  /**
   * Регистрация нового пилота
   */
  async register(
    username: string,
    email: string,
    password: string,
    ipAddress: string
  ): Promise<{ success: boolean; playerId?: string; error?: string }> {
    try {
      // Валидация пароля
      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.valid) {
        return { success: false, error: passwordValidation.error };
      }

      // Проверка существования email
      const existing = await this.getPilotByEmail(email);
      if (existing) {
        return { success: false, error: 'Email уже зарегистрирован' };
      }

      // Генерация соли и хеширование пароля
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);

      // Создание игрока
      const playerId = crypto.randomUUID();
      
      const connection = await this.db.getConnection();
      try {
        await connection.beginTransaction();

        // Создаём игрока
        await connection.execute(
          `INSERT INTO players (id, username, position_x, position_y, position_z)
           VALUES (?, ?, 0, 500, 0)`,
          [playerId, username]
        );

        // Создаём учётные данные
        await connection.execute(
          `INSERT INTO pilot_credentials 
           (player_id, email, password_hash, password_salt, is_email_verified)
           VALUES (?, ?, ?, ?, FALSE)`,
          [playerId, email, passwordHash, salt]
        );

        // Инициализируем ресурсы
        await this.db.initializePlayerResources(playerId);

        // Генерируем код подтверждения email
        const verificationCode = await this.createVerificationCode(
          playerId,
          email,
          'verify_email'
        );

        // Отправляем email
        await this.emailService.sendVerificationEmail(
          email,
          username,
          verificationCode.code
        );

        await connection.commit();

        // Логируем событие
        await this.logSecurityEvent(
          playerId,
          'email_verification_requested',
          ipAddress,
          { email }
        );

        return { success: true, playerId };

      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

    } catch (error: any) {
      console.error('Ошибка регистрации:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Вход пилота
   */
  async login(
    email: string,
    password: string,
    ipAddress: string,
    userAgent: string
  ): Promise<LoginResult> {
    try {
      // Проверка rate limit
      await this.checkRateLimit(ipAddress, 'login');

      // Получаем учётные данные
      const credentials = await this.getPilotByEmail(email);
      
      if (!credentials) {
        await this.logFailedLogin(null, email, ipAddress, userAgent, 'invalid_email');
        return { success: false, error: 'Неверный email или пароль' };
      }

      // Проверка блокировки
      if (credentials.isAccountLocked) {
        if (credentials.lockUntil && credentials.lockUntil > new Date()) {
          const minutesLeft = Math.ceil(
            (credentials.lockUntil.getTime() - Date.now()) / 60000
          );
          await this.logFailedLogin(
            credentials.playerId,
            email,
            ipAddress,
            userAgent,
            'account_locked'
          );
          return { 
            success: false, 
            error: `Аккаунт заблокирован. Осталось минут: ${minutesLeft}` 
          };
        } else {
          // Сбрасываем блокировку если истекла
          await this.unlockAccount(credentials.playerId);
        }
      }

      // Проверка пароля
      const isValidPassword = await bcrypt.compare(password, credentials.passwordHash);
      
      if (!isValidPassword) {
        await this.handleFailedLogin(credentials.playerId, ipAddress, userAgent);
        await this.logFailedLogin(
          credentials.playerId,
          email,
          ipAddress,
          userAgent,
          'invalid_password'
        );
        return { success: false, error: 'Неверный email или пароль' };
      }

      // Проверка подтверждения email
      if (!credentials.isEmailVerified) {
        return { 
          success: false, 
          error: 'Подтвердите email',
          requiresEmailVerification: true
        };
      }

      // Проверка IP в белом списке (если включено)
      const ipWhitelistEnabled = process.env.IP_WHITELIST_ENABLED === 'true';
      if (ipWhitelistEnabled) {
        const isIpAllowed = await this.checkIpWhitelist(
          credentials.playerId,
          ipAddress
        );
        if (!isIpAllowed.allowed) {
          if (isIpAllowed.requiresConfirmation) {
            return {
              success: false,
              error: 'Требуется подтверждение нового IP',
              requiresIpConfirmation: true
            };
          }
          return { success: false, error: 'IP адрес не в белом списке' };
        }
      }

      // Успешный вход - создаём токены
      const tokens = await this.generateTokenPair(credentials.playerId);

      // Создаём сессию
      const sessionId = await this.createSession(
        credentials.playerId,
        tokens.refreshToken,
        ipAddress,
        userAgent
      );

      // Сбрасываем счётчик неудачных попыток
      await this.resetFailedAttempts(credentials.playerId);

      // Логируем успешный вход
      await this.logSuccessfulLogin(
        credentials.playerId,
        email,
        ipAddress,
        userAgent,
        sessionId
      );

      return {
        success: true,
        tokens,
      };

    } catch (error: any) {
      console.error('Ошибка входа:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Выход из системы
   */
  async logout(playerId: string, sessionId: string): Promise<void> {
    try {
      // Удаляем сессию
      await this.db.execute(
        `DELETE FROM pilot_sessions WHERE id = ? AND player_id = ?`,
        [sessionId, playerId]
      );

      await this.logSecurityEvent(playerId, 'logout', null, { sessionId });
    } catch (error) {
      console.error('Ошибка выхода:', error);
    }
  }

  /**
   * Обновление токена
   */
  async refreshToken(refreshToken: string): Promise<TokenPair | null> {
    try {
      // Проверяем refresh токен
      const payload = jwt.verify(refreshToken, this.jwtConfig.refreshSecret) as any;
      
      // Проверяем сессию в БД
      const [sessions] = await this.db.execute(
        `SELECT * FROM pilot_sessions 
         WHERE id = ? AND refresh_token_hash = ? AND expires_at > NOW()`,
        [payload.sessionId, this.hashToken(refreshToken)]
      );

      const session = (sessions as any[])[0];
      if (!session) {
        return null;
      }

      // Генерируем новую пару токенов
      return await this.generateTokenPair(session.player_id);

    } catch (error) {
      console.error('Ошибка обновления токена:', error);
      return null;
    }
  }

  /**
   * Запрос сброса пароля
   */
  async requestPasswordReset(email: string, ipAddress: string): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials = await this.getPilotByEmail(email);
      
      if (!credentials) {
        // Не раскрываем существует ли email
        return { success: true };
      }

      // Создаём код сброса
      const resetCode = await this.createVerificationCode(
        credentials.playerId,
        email,
        'password_reset' as any
      );

      // Отправляем email
      await this.emailService.sendPasswordResetEmail(
        email,
        credentials.playerId,
        resetCode.code
      );

      await this.logSecurityEvent(
        credentials.playerId,
        'password_reset_requested',
        ipAddress,
        { email }
      );

      return { success: true };

    } catch (error: any) {
      console.error('Ошибка сброса пароля:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Сброс пароля по коду
   */
  async resetPassword(
    code: string,
    newPassword: string,
    ipAddress: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const codeValidation = this.validatePassword(newPassword);
      if (!codeValidation.valid) {
        return { success: false, error: codeValidation.error! };
      }

      // Находим код в БД
      const [codes] = await this.db.execute(
        `SELECT * FROM password_reset_codes 
         WHERE code_hash = ? AND is_used = FALSE AND expires_at > NOW()`,
        [this.hashToken(code)]
      );

      const resetCode = (codes as any[])[0];
      if (!resetCode) {
        return { success: false, error: 'Неверный или истёкший код' };
      }

      // Проверяем попытки
      if (resetCode.attempts_used >= resetCode.max_attempts) {
        return { success: false, error: 'Превышено количество попыток' };
      }

      // Хешируем новый пароль
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      const connection = await this.db.getConnection();
      try {
        await connection.beginTransaction();

        // Обновляем пароль
        await connection.execute(
          `UPDATE pilot_credentials 
           SET password_hash = ?, password_salt = ?, 
               last_password_change = NOW(), is_account_locked = FALSE
           WHERE player_id = ?`,
          [passwordHash, salt, resetCode.player_id]
        );

        // Помечаем код как использованный
        await connection.execute(
          `UPDATE password_reset_codes 
           SET is_used = TRUE, used_at = NOW()
           WHERE id = ?`,
          [resetCode.id]
        );

        // Завершаем все сессии
        await connection.execute(
          `DELETE FROM pilot_sessions WHERE player_id = ?`,
          [resetCode.player_id]
        );

        await connection.commit();

        await this.logSecurityEvent(
          resetCode.player_id,
          'password_reset_completed',
          ipAddress,
          { code_id: resetCode.id }
        );

        return { success: true };

      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

    } catch (error: any) {
      console.error('Ошибка сброса пароля:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Подтверждение email по коду
   */
  async verifyEmail(code: string, ipAddress: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Находим код
      const [codes] = await this.db.execute(
        `SELECT * FROM email_verification_codes 
         WHERE code_hash = ? AND is_used = FALSE AND expires_at > NOW()`,
        [this.hashToken(code)]
      );

      const verificationCode = (codes as any[])[0];
      if (!verificationCode) {
        return { success: false, error: 'Неверный или истёкший код' };
      }

      const connection = await this.db.getConnection();
      try {
        await connection.beginTransaction();

        // Подтверждаем email
        await connection.execute(
          `UPDATE pilot_credentials 
           SET is_email_verified = TRUE
           WHERE player_id = ?`,
          [verificationCode.player_id]
        );

        // Помечаем код как использованный
        await connection.execute(
          `UPDATE email_verification_codes 
           SET is_used = TRUE
           WHERE id = ?`,
          [verificationCode.id]
        );

        await connection.commit();

        await this.logSecurityEvent(
          verificationCode.player_id,
          'email_verified',
          ipAddress,
          { code_id: verificationCode.id }
        );

        return { success: true };

      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

    } catch (error: any) {
      console.error('Ошибка подтверждения email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Добавление IP в белый список
   */
  async addToIpWhitelist(
    playerId: string,
    ipAddress: string,
    description: string,
    requiresConfirmation: boolean = true
  ): Promise<{ success: boolean; code?: string; error?: string }> {
    try {
      const whitelistId = crypto.randomUUID();

      if (requiresConfirmation) {
        // Создаём код подтверждения
        const credentials = await this.getPilotById(playerId);
        const confirmationCode = await this.createVerificationCode(
          playerId,
          credentials!.email,
          'confirm_ip' as any
        );

        // Сохраняем IP с флагом неподтверждённого
        await this.db.execute(
          `INSERT INTO ip_whitelist 
           (id, player_id, ip_address, description, is_confirmed, confirmation_code_id)
           VALUES (?, ?, ?, ?, FALSE, ?)`,
          [whitelistId, playerId, ipAddress, description, confirmationCode.id]
        );

        // Отправляем email
        await this.emailService.sendIpConfirmationEmail(
          credentials!.email,
          ipAddress,
          confirmationCode.code,
          description
        );

        return { success: true, code: confirmationCode.code };

      } else {
        // Добавляем без подтверждения
        await this.db.execute(
          `INSERT INTO ip_whitelist 
           (id, player_id, ip_address, description, is_confirmed)
           VALUES (?, ?, ?, ?, TRUE)`,
          [whitelistId, playerId, ipAddress, description]
        );

        return { success: true };
      }

    } catch (error: any) {
      console.error('Ошибка добавления IP:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Подтверждение IP по коду
   */
  async confirmIp(code: string, ipAddress: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Находим код
      const [codes] = await this.db.execute(
        `SELECT * FROM email_verification_codes 
         WHERE code_hash = ? AND is_used = FALSE AND expires_at > NOW()
         AND purpose = 'confirm_ip'`,
        [this.hashToken(code)]
      );

      const confirmationCode = (codes as any[])[0];
      if (!confirmationCode) {
        return { success: false, error: 'Неверный или истёкший код' };
      }

      // Находим IP в белом списке
      const [whitelistItems] = await this.db.execute(
        `SELECT * FROM ip_whitelist 
         WHERE confirmation_code_id = ?`,
        [confirmationCode.id]
      );

      const whitelistItem = (whitelistItems as any[])[0];
      if (!whitelistItem) {
        return { success: false, error: 'IP адрес не найден' };
      }

      const connection = await this.db.getConnection();
      try {
        await connection.beginTransaction();

        // Подтверждаем IP
        await connection.execute(
          `UPDATE ip_whitelist 
           SET is_confirmed = TRUE, confirmation_code_id = NULL
           WHERE id = ?`,
          [whitelistItem.id]
        );

        // Помечаем код как использованный
        await connection.execute(
          `UPDATE email_verification_codes 
           SET is_used = TRUE
           WHERE id = ?`,
          [confirmationCode.id]
        );

        await connection.commit();

        await this.logSecurityEvent(
          whitelistItem.player_id,
          'ip_whitelist_confirmed',
          ipAddress,
          { ip: whitelistItem.ip_address }
        );

        return { success: true };

      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

    } catch (error: any) {
      console.error('Ошибка подтверждения IP:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Получение истории входов
   */
  async getLoginHistory(playerId: string, limit: number = 50): Promise<any[]> {
    try {
      const [rows] = await this.db.execute(
        `SELECT * FROM login_attempts_log 
         WHERE player_id = ? OR email = (SELECT email FROM pilot_credentials WHERE player_id = ?)
         ORDER BY created_at DESC
         LIMIT ?`,
        [playerId, playerId, limit]
      );
      return rows as any[];
    } catch (error) {
      console.error('Ошибка получения истории:', error);
      return [];
    }
  }

  /**
   * Получение активных сессий
   */
  async getActiveSessions(playerId: string): Promise<any[]> {
    try {
      const [rows] = await this.db.execute(
        `SELECT id, ip_address, user_agent, device_info, expires_at, last_activity, is_current_session
         FROM pilot_sessions
         WHERE player_id = ? AND expires_at > NOW()
         ORDER BY last_activity DESC`,
        [playerId]
      );
      return rows as any[];
    } catch (error) {
      console.error('Ошибка получения сессий:', error);
      return [];
    }
  }

  /**
   * Завершение сессии
   */
  async terminateSession(playerId: string, sessionId: string): Promise<boolean> {
    try {
      const [result] = await this.db.execute(
        `DELETE FROM pilot_sessions WHERE id = ? AND player_id = ?`,
        [sessionId, playerId]
      );
      return (result as any).affectedRows > 0;
    } catch (error) {
      console.error('Ошибка завершения сессии:', error);
      return false;
    }
  }

  // ============================================================================
  // Приватные методы
  // ============================================================================

  private async getPilotByEmail(email: string): Promise<PilotCredentials | null> {
    const [rows] = await this.db.execute(
      `SELECT player_id, email, password_hash, password_salt, 
              is_email_verified, is_account_locked, lock_until, 
              failed_login_attempts
       FROM pilot_credentials
       WHERE email = ?`,
      [email]
    );

    const row = (rows as any[])[0];
    if (!row) return null;

    return {
      playerId: row.player_id,
      email: row.email,
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt,
      isEmailVerified: !!row.is_email_verified,
      isAccountLocked: !!row.is_account_locked,
      lockUntil: row.lock_until,
      failedLoginAttempts: row.failed_login_attempts || 0
    };
  }

  private async getPilotById(playerId: string): Promise<PilotCredentials | null> {
    const [rows] = await this.db.execute(
      `SELECT player_id, email, password_hash, password_salt, 
              is_email_verified, is_account_locked, lock_until, 
              failed_login_attempts
       FROM pilot_credentials
       WHERE player_id = ?`,
      [playerId]
    );

    const row = (rows as any[])[0];
    if (!row) return null;

    return {
      playerId: row.player_id,
      email: row.email,
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt,
      isEmailVerified: !!row.is_email_verified,
      isAccountLocked: !!row.is_account_locked,
      lockUntil: row.lock_until,
      failedLoginAttempts: row.failed_login_attempts || 0
    };
  }

  private validatePassword(password: string): { valid: boolean; error?: string } {
    if (password.length < this.securityConfig.passwordMinLength) {
      return { 
        valid: false, 
        error: `Пароль должен быть не менее ${this.securityConfig.passwordMinLength} символов` 
      };
    }

    if (this.securityConfig.requireStrongPassword) {
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasNumbers = /\d/.test(password);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

      if (!hasUppercase || !hasLowercase || !hasNumbers || !hasSpecial) {
        return {
          valid: false,
          error: 'Пароль должен содержать заглавные буквы, строчные буквы, цифры и специальные символы'
        };
      }
    }

    return { valid: true };
  }

  private async generateTokenPair(playerId: string): Promise<TokenPair> {
    const sessionId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    // Access token
    const accessToken = jwt.sign(
      {
        playerId,
        sessionId,
        type: 'access'
      },
      this.jwtConfig.accessSecret,
      { expiresIn: this.jwtConfig.accessExpiresIn } as jwt.SignOptions
    );

    // Refresh token
    const refreshToken = jwt.sign(
      {
        playerId,
        sessionId,
        type: 'refresh'
      },
      this.jwtConfig.refreshSecret,
      { expiresIn: this.jwtConfig.refreshExpiresIn } as jwt.SignOptions
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: parseInt(this.jwtConfig.accessExpiresIn) * 60 // в секундах
    };
  }

  private async createSession(
    playerId: string,
    refreshToken: string,
    ipAddress: string,
    userAgent: string
  ): Promise<string> {
    const sessionId = crypto.randomUUID();
    const refreshTokenHash = this.hashToken(refreshToken);

    // Парсим user agent для device info
    const deviceInfo = this.parseUserAgent(userAgent);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.securityConfig.sessionTimeoutDays);

    await this.db.execute(
      `INSERT INTO pilot_sessions 
       (id, player_id, refresh_token_hash, ip_address, user_agent, device_info, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, playerId, refreshTokenHash, ipAddress, userAgent, JSON.stringify(deviceInfo), expiresAt]
    );

    await this.logSecurityEvent(playerId, 'session_created', ipAddress, { sessionId, deviceInfo });

    return sessionId;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async handleFailedLogin(
    playerId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    // Увеличиваем счётчик попыток
    await this.db.execute(
      `UPDATE pilot_credentials 
       SET failed_login_attempts = failed_login_attempts + 1
       WHERE player_id = ?`,
      [playerId]
    );

    // Проверяем на блокировку
    const [credentials] = await this.db.execute(
      `SELECT failed_login_attempts FROM pilot_credentials WHERE player_id = ?`,
      [playerId]
    );

    const failedAttempts = (credentials as any[])[0]?.failed_login_attempts || 0;

    if (failedAttempts >= this.securityConfig.maxLoginAttempts) {
      // Блокируем аккаунт
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + this.securityConfig.lockoutDurationMinutes);

      await this.db.execute(
        `UPDATE pilot_credentials 
         SET is_account_locked = TRUE, lock_until = ?
         WHERE player_id = ?`,
        [lockUntil, playerId]
      );

      await this.logSecurityEvent(
        playerId,
        'account_locked',
        ipAddress,
        { failedAttempts, lockUntil }
      );

      // Обнаружена brute force атака
      await this.logSecurityEvent(
        playerId,
        'brute_force_detected',
        ipAddress,
        { failedAttempts },
        'critical'
      );
    }
  }

  private async resetFailedAttempts(playerId: string): Promise<void> {
    await this.db.execute(
      `UPDATE pilot_credentials 
       SET failed_login_attempts = 0, is_account_locked = FALSE, lock_until = NULL
       WHERE player_id = ?`,
      [playerId]
    );
  }

  private async unlockAccount(playerId: string): Promise<void> {
    await this.db.execute(
      `UPDATE pilot_credentials 
       SET is_account_locked = FALSE, lock_until = NULL, failed_login_attempts = 0
       WHERE player_id = ?`,
      [playerId]
    );

    await this.logSecurityEvent(playerId, 'account_unlocked', null, {});
  }

  private async checkRateLimit(identifier: string, action: string): Promise<void> {
    try {
      await this.db.execute(
        `CALL check_rate_limit(?, ?, ?, ?, ?)`,
        [identifier, 'ip', action, this.securityConfig.rateLimitMaxRequests, this.securityConfig.rateLimitWindowMinutes]
      );
    } catch (error: any) {
      if (error.message.includes('Rate limit')) {
        throw new Error('Слишком много запросов. Попробуйте позже.');
      }
      throw error;
    }
  }

  private async checkIpWhitelist(playerId: string, ipAddress: string): Promise<{ allowed: boolean; requiresConfirmation?: boolean }> {
    // Проверяем включён ли белый список для игрока
    const [whitelistItems] = await this.db.execute(
      `SELECT * FROM ip_whitelist WHERE player_id = ? AND ip_address = ?`,
      [playerId, ipAddress]
    );

    const whitelistItem = (whitelistItems as any[])[0];

    if (whitelistItem) {
      if (whitelistItem.is_confirmed) {
        // Обновляем last_used
        await this.db.execute(
          `UPDATE ip_whitelist SET last_used = NOW() WHERE id = ?`,
          [whitelistItem.id]
        );
        return { allowed: true };
      } else {
        return { allowed: false, requiresConfirmation: true };
      }
    }

    // Если белый список пуст, разрешаем вход (первый вход)
    const [allWhitelistItems] = await this.db.execute(
      `SELECT COUNT(*) as count FROM ip_whitelist WHERE player_id = ?`,
      [playerId]
    );

    if ((allWhitelistItems as any[])[0].count === 0) {
      return { allowed: true };
    }

    return { allowed: false };
  }

  private async createVerificationCode(
    playerId: string,
    email: string,
    purpose: 'verify_email' | 'password_reset' | 'confirm_ip' | 'change_email'
  ): Promise<{ id: string; code: string }> {
    const id = crypto.randomUUID();
    const code = crypto.randomInt(100000, 999999).toString(); // 6-значный код
    const codeHash = this.hashToken(code);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 минут

    const tableName = purpose === 'password_reset' ? 'password_reset_codes' : 'email_verification_codes';

    await this.db.execute(
      `INSERT INTO ${tableName} 
       (id, player_id, email, code_hash, purpose, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, playerId, email, codeHash, purpose, expiresAt]
    );

    return { id, code };
  }

  private async logSuccessfulLogin(
    playerId: string,
    email: string,
    ipAddress: string,
    userAgent: string,
    sessionId: string
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO login_attempts_log 
       (player_id, email, ip_address, user_agent, success, session_id)
       VALUES (?, ?, ?, ?, TRUE, ?)`,
      [playerId, email, ipAddress, userAgent, sessionId]
    );

    await this.logSecurityEvent(playerId, 'login_success', ipAddress, { sessionId, email });
  }

  private async logFailedLogin(
    playerId: string | null,
    email: string,
    ipAddress: string,
    userAgent: string,
    reason: 'invalid_email' | 'invalid_password' | 'account_locked' | 'ip_blocked' | 'expired_code' | 'max_attempts' | 'other'
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO login_attempts_log 
       (player_id, email, ip_address, user_agent, success, failure_reason)
       VALUES (?, ?, ?, ?, FALSE, ?)`,
      [playerId, email, ipAddress, userAgent, reason]
    );

    if (playerId) {
      await this.logSecurityEvent(playerId, 'login_failed', ipAddress, { email, reason });
    }
  }

  private async logSecurityEvent(
    playerId: string,
    eventType: string,
    ipAddress: string | null,
    details: any,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO security_events_log 
       (player_id, event_type, ip_address, details, severity)
       VALUES (?, ?, ?, ?, ?)`,
      [playerId, eventType, ipAddress, JSON.stringify(details), severity]
    );
  }

  private parseUserAgent(userAgent: string): any {
    // Простой парсинг user agent
    const browser = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)/i)?.[1] || 'Unknown';
    const os = userAgent.match(/(Windows|Mac|Linux|Android|iOS)/i)?.[1] || 'Unknown';
    const device = /Mobile/i.test(userAgent) ? 'mobile' : 'desktop';

    return { browser, os, device };
  }
}
