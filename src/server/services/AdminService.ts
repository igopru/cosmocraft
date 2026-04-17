// src/server/services/AdminService.ts
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as speakeasy from 'speakeasy';
import { DatabaseManager } from '../storage/DatabaseManager';

/**
 * Роль администратора
 */
export type AdminRole = 'super_admin' | 'admin' | 'moderator';

/**
 * Данные администратора
 */
export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: AdminRole;
  permissions: any;
  isActive: boolean;
}

/**
 * Настройка сервера
 */
export interface ServerSetting {
  id: string;
  value: any;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  description: string;
  category: string;
  isPublic: boolean;
}

/**
 * Действие администратора
 */
export interface AdminAction {
  adminId: string;
  actionType: string;
  targetType?: string;
  targetId?: string;
  details?: any;
  ipAddress: string;
  userAgent: string;
}

/**
 * Сервис админ-панели
 */
export class AdminService {
  private db: DatabaseManager;
  private jwtSecret: string;

  constructor(db: DatabaseManager, jwtSecret: string) {
    this.db = db;
    this.jwtSecret = jwtSecret;
  }

  /**
   * Вход администратора
   */
  async adminLogin(
    username: string,
    password: string,
    ipAddress: string,
    userAgent: string
  ): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      // Поиск администратора
      const [admins] = await this.db.execute(
        `SELECT * FROM admin_users WHERE username = ? AND is_active = TRUE`,
        [username]
      );

      const admin = (admins as any[])[0];
      if (!admin) {
        return { success: false, error: 'Неверное имя пользователя или пароль' };
      }

      // Проверка пароля
      const isValid = await bcrypt.compare(password, admin.password_hash);
      if (!isValid) {
        return { success: false, error: 'Неверное имя пользователя или пароль' };
      }

      // Генерация JWT токена
      const token = jwt.sign(
        {
          adminId: admin.id,
          username: admin.username,
          role: admin.role,
          type: 'admin'
        },
        this.jwtSecret,
        { expiresIn: '8h' }
      );

      // Создание сессии
      const sessionId = crypto.randomUUID();
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 8);

      await this.db.execute(
        `INSERT INTO admin_sessions (id, admin_id, token_hash, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sessionId, admin.id, tokenHash, ipAddress, userAgent, expiresAt]
      );

      // Обновление last_login
      await this.db.execute(
        `UPDATE admin_users SET last_login = NOW() WHERE id = ?`,
        [admin.id]
      );

      // Логирование действия
      await this.logAdminAction({
        adminId: admin.id,
        actionType: 'admin_login',
        ipAddress,
        userAgent
      });

      return { success: true, token };

    } catch (error: any) {
      console.error('Ошибка входа администратора:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Выход администратора
   */
  async adminLogout(token: string, adminId: string): Promise<void> {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await this.db.execute(
        `DELETE FROM admin_sessions WHERE token_hash = ? AND admin_id = ?`,
        [tokenHash, adminId]
      );

      await this.logAdminAction({
        adminId,
        actionType: 'admin_logout',
        ipAddress: '',
        userAgent: ''
      });
    } catch (error) {
      console.error('Ошибка выхода:', error);
    }
  }

  /**
   * Проверка токена администратора
   */
  async verifyAdminToken(token: string): Promise<AdminUser | null> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as any;
      
      if (payload.type !== 'admin') {
        return null;
      }

      // Проверка сессии
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const [sessions] = await this.db.execute(
        `SELECT * FROM admin_sessions WHERE token_hash = ? AND expires_at > NOW()`,
        [tokenHash]
      );

      if ((sessions as any[]).length === 0) {
        return null;
      }

      return {
        id: payload.adminId,
        username: payload.username,
        email: payload.email || '',
        role: payload.role,
        permissions: payload.permissions || {},
        isActive: true
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Получить всех игроков
   */
  async getAllPlayers(limit: number = 100, offset: number = 0): Promise<any[]> {
    const lim = Number(limit) || 100;
    const off = Number(offset) || 0;
    const [rows] = await this.db.execute(
      `SELECT p.id, p.username, p.email, p.created_at, p.last_login, p.is_online,
              pc.email as auth_email, pc.is_email_verified, pc.is_account_locked,
              pc.failed_login_attempts, pc.lock_until,
              (SELECT COUNT(*) FROM pilot_sessions WHERE player_id = p.id AND expires_at > NOW()) as active_sessions
       FROM players p
       LEFT JOIN pilot_credentials pc ON p.id = pc.player_id
       ORDER BY p.created_at DESC
       LIMIT ${lim} OFFSET ${off}`
    );

    return rows as any[];
  }

  /**
   * Получить игрока по ID
   */
  async getPlayerById(playerId: string): Promise<any | null> {
    const [rows] = await this.db.execute(
      `SELECT p.*, pc.email, pc.is_email_verified, pc.is_account_locked,
              pr_metal.amount as metal, pr_silicon.amount as silicon, 
              pr_ice.amount as ice, pr_rare.amount as rare
       FROM players p
       LEFT JOIN pilot_credentials pc ON p.id = pc.player_id
       LEFT JOIN player_resources pr_metal ON p.id = pr_metal.player_id AND pr_metal.resource_type = 'metal'
       LEFT JOIN player_resources pr_silicon ON p.id = pr_silicon.player_id AND pr_silicon.resource_type = 'silicon'
       LEFT JOIN player_resources pr_ice ON p.id = pr_ice.player_id AND pr_ice.resource_type = 'ice'
       LEFT JOIN player_resources pr_rare ON p.id = pr_rare.player_id AND pr_rare.resource_type = 'rare'
       WHERE p.id = ?`,
      [playerId]
    );

    return (rows as any[])[0] || null;
  }

  /**
   * Заблокировать игрока
   */
  async banPlayer(
    playerId: string,
    adminId: string,
    reason: string,
    durationMinutes?: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const connection = await this.db.getConnection();
      try {
        await connection.beginTransaction();

        // Блокировка аккаунта
        if (durationMinutes) {
          const lockUntil = new Date();
          lockUntil.setMinutes(lockUntil.getMinutes() + durationMinutes);
          await connection.execute(
            `UPDATE pilot_credentials 
             SET is_account_locked = TRUE, lock_until = ?
             WHERE player_id = ?`,
            [lockUntil, playerId]
          );
        } else {
          await connection.execute(
            `UPDATE pilot_credentials 
             SET is_account_locked = TRUE
             WHERE player_id = ?`,
            [playerId]
          );
        }

        // Завершение всех сессий
        await connection.execute(
          `DELETE FROM pilot_sessions WHERE player_id = ?`,
          [playerId]
        );

        await connection.commit();

        // Логирование
        await this.logAdminAction({
          adminId,
          actionType: 'ban_player',
          targetType: 'player',
          targetId: playerId,
          details: { reason, durationMinutes },
          ipAddress: '',
          userAgent: ''
        });

        return { success: true };

      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

    } catch (error: any) {
      console.error('Ошибка блокировки:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Разблокировать игрока
   */
  async unbanPlayer(playerId: string, adminId: string): Promise<{ success: boolean }> {
    try {
      await this.db.execute(
        `UPDATE pilot_credentials 
         SET is_account_locked = FALSE, lock_until = NULL, failed_login_attempts = 0
         WHERE player_id = ?`,
        [playerId]
      );

      await this.logAdminAction({
        adminId,
        actionType: 'unban_player',
        targetType: 'player',
        targetId: playerId,
        ipAddress: '',
        userAgent: ''
      });

      return { success: true };
    } catch (error: any) {
      console.error('Ошибка разблокировки:', error);
      return { success: false };
    }
  }

  /**
   * Удалить игрока
   */
  async deletePlayer(playerId: string, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.db.execute(`DELETE FROM players WHERE id = ?`, [playerId]);

      await this.logAdminAction({
        adminId,
        actionType: 'delete_player',
        targetType: 'player',
        targetId: playerId,
        ipAddress: '',
        userAgent: ''
      });

      return { success: true };
    } catch (error: any) {
      console.error('Ошибка удаления:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Создать администратора
   */
  async createAdmin(
    username: string,
    email: string,
    password: string,
    role: AdminRole,
    adminId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Проверка существования
      const [existing] = await this.db.execute(
        `SELECT id FROM admin_users WHERE username = ? OR email = ?`,
        [username, email]
      );

      if ((existing as any[]).length > 0) {
        return { success: false, error: 'Пользователь с таким именем или email уже существует' };
      }

      // Хеширование пароля
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);

      const newAdminId = crypto.randomUUID();
      const permissions = this.getDefaultPermissions(role);

      await this.db.execute(
        `INSERT INTO admin_users (id, username, email, password_hash, password_salt, role, permissions)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newAdminId, username, email, passwordHash, salt, role, permissions]
      );

      await this.logAdminAction({
        adminId,
        actionType: 'create_admin',
        targetType: 'admin',
        targetId: newAdminId,
        details: { username, email, role },
        ipAddress: '',
        userAgent: ''
      });

      return { success: true };

    } catch (error: any) {
      console.error('Ошибка создания администратора:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Получить настройки сервера
   */
  async getServerSettings(category?: string, publicOnly: boolean = false): Promise<ServerSetting[]> {
    try {
      let query = `SELECT * FROM server_settings`;
      const params: any[] = [];

      const conditions: string[] = [];
      if (category) {
        conditions.push('category = ?');
        params.push(category);
      }
      if (publicOnly) {
        conditions.push('is_public = TRUE');
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      const [rows] = await this.db.execute(query, params);

      return (rows as any[]).map(row => ({
        id: row.id,
        value: this.parseValue(row.value, row.value_type),
        valueType: row.value_type,
        description: row.description,
        category: row.category,
        isPublic: !!row.is_public
      }));
    } catch (error: any) {
      console.error('Ошибка получения настроек:', error);
      return [];
    }
  }

  /**
   * Обновить настройку сервера
   */
  async updateServerSetting(
    settingId: string,
    value: any,
    adminId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Получаем текущую настройку
      const [settings] = await this.db.execute(
        `SELECT * FROM server_settings WHERE id = ?`,
        [settingId]
      );

      const setting = (settings as any[])[0];
      if (!setting) {
        return { success: false, error: 'Настройка не найдена' };
      }

      // Преобразование значения
      const stringValue = this.stringifyValue(value, setting.value_type);

      await this.db.execute(
        `UPDATE server_settings SET value = ?, updated_by = ? WHERE id = ?`,
        [stringValue, adminId, settingId]
      );

      await this.logAdminAction({
        adminId,
        actionType: 'update_setting',
        targetType: 'setting',
        targetId: settingId,
        details: { value },
        ipAddress: '',
        userAgent: ''
      });

      return { success: true };

    } catch (error: any) {
      console.error('Ошибка обновления настройки:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Получить статистику сервера
   */
  async getServerStats(): Promise<any> {
    try {
      const [rows] = await this.db.execute(`SELECT * FROM admin_server_stats`);
      return (rows as any[])[0] || {};
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      return {};
    }
  }

  /**
   * Получить активных игроков
   */
  async getActivePlayers(): Promise<any[]> {
    try {
      const [rows] = await this.db.execute(`SELECT * FROM admin_active_players`);
      return rows as any[];
    } catch (error) {
      console.error('Ошибка получения активных игроков:', error);
      return [];
    }
  }

  /**
   * Получить журнал действий администраторов
   */
  async getAdminActionsLog(limit: number = 100, offset: number = 0, actionType?: string): Promise<any[]> {
    try {
      let query = `SELECT al.*, au.username as admin_username
                   FROM admin_actions_log al
                   LEFT JOIN admin_users au ON al.admin_id = au.id`;
      const params: any[] = [];

      if (actionType) {
        query += ' WHERE al.action_type = ?';
        params.push(actionType);
      }

      query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [rows] = await this.db.execute(query, params);
      return rows as any[];
    } catch (error) {
      console.error('Ошибка получения лога:', error);
      return [];
    }
  }

  /**
   * Записать действие в audit_log
   */
  async logAuditChange(
    adminId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    oldValue: any,
    newValue: any,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    try {
      await this.db.execute(
        `INSERT INTO admin_audit_log
         (admin_id, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [adminId, action, resourceType, resourceId,
         oldValue ? JSON.stringify(oldValue) : null,
         newValue ? JSON.stringify(newValue) : null,
         ipAddress, userAgent]
      );
    } catch (error) {
      console.error('Ошибка записи в audit_log:', error);
    }
  }

  /**
   * Включить/выключить 2FA для игрока
   */
  async togglePlayer2FA(playerId: string, enabled: boolean): Promise<{ success: boolean; secret?: string; qrCode?: string }> {
    try {
      if (enabled) {
        // Генерация секрета для TOTP
        const secret = speakeasy.generateSecret({
          name: `CosmoCraft (${playerId})`,
          length: 32
        });

        await this.db.execute(
          `INSERT INTO two_factor_auth (player_id, secret_key, is_enabled)
           VALUES (?, ?, TRUE)
           ON DUPLICATE KEY UPDATE secret_key = ?, is_enabled = TRUE`,
          [playerId, secret.base32, secret.base32]
        );

        return {
          success: true,
          secret: secret.base32,
          qrCode: secret.otpauth_url!
        };
      } else {
        await this.db.execute(
          `UPDATE two_factor_auth SET is_enabled = FALSE WHERE player_id = ?`,
          [playerId]
        );

        return { success: true };
      }
    } catch (error: any) {
      console.error('Ошибка 2FA:', error);
      return { success: false };
    }
  }

  /**
   * Проверка 2FA кода
   */
  async verify2FACode(playerId: string, token: string): Promise<boolean> {
    try {
      const [rows] = await this.db.execute(
        `SELECT secret_key FROM two_factor_auth WHERE player_id = ? AND is_enabled = TRUE`,
        [playerId]
      );

      const row = (rows as any[])[0];
      if (!row) {
        return false;
      }

      const verified = speakeasy.totp.verify({
        secret: row.secret_key,
        encoding: 'base32',
        token: token,
        window: 1
      });

      return verified;
    } catch (error) {
      console.error('Ошибка проверки 2FA:', error);
      return false;
    }
  }

  // ============================================================================
  // Приватные методы
  // ============================================================================

  private async logAdminAction(action: AdminAction): Promise<void> {
    try {
      await this.db.execute(
        `INSERT INTO admin_actions_log
         (admin_id, action_type, target_type, target_id, details, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          action.adminId,
          action.actionType,
          action.targetType || null,
          action.targetId || null,
          action.details ? JSON.stringify(action.details) : null,
          action.ipAddress || null,
          action.userAgent || null
        ]
      );
    } catch (error) {
      console.error('Ошибка логирования:', error);
    }
  }

  private getDefaultPermissions(role: AdminRole): any {
    const permissions: Record<AdminRole, any> = {
      super_admin: { all: true },
      admin: {
        managePlayers: true,
        manageSettings: true,
        viewLogs: true,
        manageReports: true
      },
      moderator: {
        managePlayers: true,
        viewLogs: false,
        manageReports: true
      }
    };

    return permissions[role] || {};
  }

  private parseValue(value: string, type: string): any {
    switch (type) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value === 'true';
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  private stringifyValue(value: any, type: string): string {
    switch (type) {
      case 'number':
        return String(Number(value));
      case 'boolean':
        return value ? 'true' : 'false';
      case 'json':
        return JSON.stringify(value);
      default:
        return String(value);
    }
  }
}
