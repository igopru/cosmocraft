// src/server/services/EmailService.ts
import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import * as fs from 'fs';

/**
 * Конфигурация email сервера
 */
export interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
  fromName: string;
  via?: 'smtp' | 'msmtp';
  msmtpPath?: string;
  msmtpConfig?: string;
}

/**
 * Email сервис для отправки уведомлений
 */
export class EmailService {
  private config: EmailConfig;
  private transporter: nodemailer.Transporter | null = null;

  constructor(config: EmailConfig) {
    this.config = config;

    if (config.enabled) {
      // Используем msmtp если настроен
      if (config.via === 'msmtp' && config.msmtpPath) {
        console.log('📧 Email сервис настроен через msmtp');
        console.log(`   msmtp: ${config.msmtpPath}`);
        console.log(`   config: ${config.msmtpConfig || '~/.msmtprc'}`);
        console.log(`   from: ${config.from}`);
      } else {
        // Используем прямой SMTP через nodemailer
        this.transporter = nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: config.auth,
          tls: {
            rejectUnauthorized: false // Для самоподписанных сертификатов
          }
        });

        // Проверяем подключение
        this.transporter.verify((error, success) => {
          if (error) {
            console.error('❌ Ошибка подключения к SMTP серверу:', error.message);
          } else {
            console.log('✅ Email сервис подключён (SMTP)');
          }
        });
      }
    } else {
      console.log('📧 Email сервис отключен (письма будут в лог)');
    }
  }

  /**
   * Отправка email через msmtp
   */
  private async sendViaMsmtp(to: string, subject: string, html: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const msmtpPath = this.config.msmtpPath || '/usr/bin/msmtp';
      const msmtpConfig = this.config.msmtpConfig || '/home/father/.msmtprc';
      
      // Создаём MIME-сообщение
      const mimeMessage = [
        `From: "${this.config.fromName}" <${this.config.from}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset="utf-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
        html
      ].join('\n');

      const args = msmtpConfig ? ['-C', msmtpConfig, '-t'] : ['-t'];
      
      const msmtp = exec(`${msmtpPath} ${args.join(' ')}`, (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Ошибка отправки через msmtp:', stderr || error.message);
          reject(new Error(stderr || error.message));
        } else {
          console.log(`✅ Email отправлен через msmtp: ${to}`);
          resolve();
        }
      });

      msmtp.stdin?.write(mimeMessage);
      msmtp.stdin?.end();
    });
  }

  /**
   * Отправка email с подтверждением регистрации
   */
  async sendVerificationEmail(
    email: string,
    username: string,
    code: string
  ): Promise<void> {
    const subject = '🚀 CosmoCraft - Подтверждение email';
    
    const html = this.createVerificationEmailTemplate(username, code);

    await this.sendEmail(email, subject, html);
  }

  /**
   * Отправка email со сбросом пароля
   */
  async sendPasswordResetEmail(
    email: string,
    username: string,
    code: string
  ): Promise<void> {
    const subject = '🔑 CosmoCraft - Сброс пароля';
    
    const html = this.createPasswordResetEmailTemplate(username, code);

    await this.sendEmail(email, subject, html);
  }

  /**
   * Отправка email с подтверждением IP
   */
  async sendIpConfirmationEmail(
    email: string,
    ipAddress: string,
    code: string,
    description?: string
  ): Promise<void> {
    const subject = '🌐 CosmoCraft - Подтверждение нового IP адреса';
    
    const html = this.createIpConfirmationEmailTemplate(ipAddress, code, description);

    await this.sendEmail(email, subject, html);
  }

  /**
   * Отправка email о входе с нового устройства
   */
  async sendNewDeviceEmail(
    email: string,
    username: string,
    deviceInfo: any,
    ipAddress: string,
    location?: string
  ): Promise<void> {
    const subject = '⚠️ CosmoCraft - Вход с нового устройства';
    
    const html = this.createNewDeviceEmailTemplate(username, deviceInfo, ipAddress, location);

    await this.sendEmail(email, subject, html);
  }

  /**
   * Отправка email о подозрительной активности
   */
  async sendSuspiciousActivityEmail(
    email: string,
    username: string,
    attempts: number,
    ipAddress: string
  ): Promise<void> {
    const subject = '🚨 CosmoCraft - Подозрительная активность';
    
    const html = this.createSuspiciousActivityEmailTemplate(username, attempts, ipAddress);

    await this.sendEmail(email, subject, html);
  }

  /**
   * Основная метода отправки
   */
  private async sendEmail(
    to: string,
    subject: string,
    html: string
  ): Promise<void> {
    if (!this.config.enabled) {
      // Логируем письмо вместо отправки
      console.log('\n📧 EMAIL (отключен):');
      console.log(`   To: ${to}`);
      console.log(`   Subject: ${subject}`);
      console.log(`   HTML: ${html.substring(0, 200)}...`);
      return;
    }

    // Используем msmtp если настроен
    if (this.config.via === 'msmtp' && this.config.msmtpPath) {
      try {
        await this.sendViaMsmtp(to, subject, html);
      } catch (error: any) {
        console.error('❌ Ошибка отправки email (msmtp):', error.message);
      }
      return;
    }

    // Используем прямой SMTP
    if (!this.transporter) {
      console.log('\n📧 EMAIL (SMTP транспортер не создан):');
      console.log(`   To: ${to}`);
      console.log(`   Subject: ${subject}`);
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.from}>`,
        to,
        subject,
        html,
        // Добавляем заголовки безопасности
        headers: {
          'X-Priority': '3',
          'X-Mailer': 'CosmoCraft Mailer v1.0',
        },
      });

      console.log(`✅ Email отправлен: ${to} (${info.messageId})`);
    } catch (error: any) {
      console.error('❌ Ошибка отправки email:', error.message);
      // Не выбрасываем ошибку, чтобы не ломать основной поток
    }
  }

  // ============================================================================
  // Шаблоны писем
  // ============================================================================

  private createVerificationEmailTemplate(username: string, code: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0a1a; color: #fff; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; background: linear-gradient(135deg, #1a1a3e 0%, #0a0a1a 100%); }
    .logo { font-size: 48px; }
    .content { background: #1a1a3e; padding: 30px; border-radius: 10px; margin-top: 20px; }
    .code { font-size: 32px; font-weight: bold; color: #44aaff; text-align: center; padding: 20px; background: #0a0a1a; border-radius: 5px; letter-spacing: 5px; }
    .warning { background: #332200; border-left: 4px solid #ffaa00; padding: 15px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🚀</div>
      <h1>CosmoCraft</h1>
    </div>
    
    <div class="content">
      <h2>Добро пожаловать, ${this.escapeHtml(username)}!</h2>
      
      <p>Для завершения регистрации подтвердите ваш email адрес.</p>
      
      <p><strong>Ваш код подтверждения:</strong></p>
      <div class="code">${code}</div>
      
      <p>Или перейдите по ссылке:</p>
      <p style="text-align: center;">
        <a href="${this.config.enabled ? 'https://cosmocraft.game' : '#'}/verify?code=${code}" 
           style="display: inline-block; padding: 12px 30px; background: #44aaff; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
          Подтвердить email
        </a>
      </p>
      
      <div class="warning">
        <strong>⚠️ Важно:</strong> Код действителен в течение 30 минут. Не сообщайте код никому.
      </div>
      
      <p>Если вы не регистрировались в CosmoCraft, просто проигнорируйте это письмо.</p>
    </div>
    
    <div class="footer">
      <p>CosmoCraft © 2026. Все права защищены.</p>
      <p>Это автоматическое письмо, не отвечайте на него.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  private createPasswordResetEmailTemplate(username: string, code: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0a1a; color: #fff; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; background: linear-gradient(135deg, #1a1a3e 0%, #0a0a1a 100%); }
    .content { background: #1a1a3e; padding: 30px; border-radius: 10px; margin-top: 20px; }
    .code { font-size: 32px; font-weight: bold; color: #ffaa44; text-align: center; padding: 20px; background: #0a0a1a; border-radius: 5px; letter-spacing: 5px; }
    .warning { background: #330000; border-left: 4px solid #ff4444; padding: 15px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🔑</div>
      <h1>Сброс пароля</h1>
    </div>
    
    <div class="content">
      <h2>Здравствуйте, ${this.escapeHtml(username)}!</h2>
      
      <p>Вы запросили сброс пароля для вашего аккаунта CosmoCraft.</p>
      
      <p><strong>Ваш код сброса:</strong></p>
      <div class="code">${code}</div>
      
      <div class="warning">
        <strong>🚨 Внимание:</strong> Если вы не запрашивали сброс пароля, немедленно обратитесь в поддержку!
      </div>
      
      <p>Код действителен в течение 30 минут.</p>
    </div>
    
    <div class="footer">
      <p>CosmoCraft © 2026</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  private createIpConfirmationEmailTemplate(
    ipAddress: string,
    code: string,
    description?: string
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0a1a; color: #fff; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; background: linear-gradient(135deg, #1a1a3e 0%, #0a0a1a 100%); }
    .content { background: #1a1a3e; padding: 30px; border-radius: 10px; margin-top: 20px; }
    .code { font-size: 32px; font-weight: bold; color: #44ff88; text-align: center; padding: 20px; background: #0a0a1a; border-radius: 5px; letter-spacing: 5px; }
    .ip-address { font-family: monospace; background: #0a0a1a; padding: 10px; border-radius: 5px; text-align: center; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🌐</div>
      <h1>Подтверждение IP адреса</h1>
    </div>
    
    <div class="content">
      <h2>Новый IP адрес для вашего аккаунта</h2>
      
      <p>Запрошено добавление нового IP адреса в белый список:</p>
      <div class="ip-address">${this.escapeHtml(ipAddress)}</div>
      ${description ? `<p><strong>Описание:</strong> ${this.escapeHtml(description)}</p>` : ''}
      
      <p><strong>Код подтверждения:</strong></p>
      <div class="code">${code}</div>
      
      <p>Введите этот код в настройках безопасности для подтверждения IP.</p>
    </div>
    
    <div class="footer">
      <p>CosmoCraft © 2026</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  private createNewDeviceEmailTemplate(
    username: string,
    deviceInfo: any,
    ipAddress: string,
    location?: string
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0a1a; color: #fff; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; background: linear-gradient(135deg, #1a1a3e 0%, #0a0a1a 100%); }
    .content { background: #1a1a3e; padding: 30px; border-radius: 10px; margin-top: 20px; }
    .device-info { background: #0a0a1a; padding: 15px; border-radius: 5px; margin: 15px 0; }
    .warning { background: #332200; border-left: 4px solid #ffaa00; padding: 15px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">⚠️</div>
      <h1>Вход с нового устройства</h1>
    </div>
    
    <div class="content">
      <h2>Здравствуйте, ${this.escapeHtml(username)}!</h2>
      
      <p>Зафиксирован вход в ваш аккаунт с нового устройства:</p>
      
      <div class="device-info">
        <p><strong>Устройство:</strong> ${deviceInfo.device || 'Неизвестно'}</p>
        <p><strong>Браузер:</strong> ${deviceInfo.browser || 'Неизвестно'}</p>
        <p><strong>ОС:</strong> ${deviceInfo.os || 'Неизвестно'}</p>
        <p><strong>IP адрес:</strong> ${this.escapeHtml(ipAddress)}</p>
        ${location ? `<p><strong>Местоположение:</strong> ${this.escapeHtml(location)}</p>` : ''}
      </div>
      
      <div class="warning">
        <strong>⚠️ Это были не вы?</strong><br>
        Немедленно смените пароль и обратитесь в поддержку!
      </div>
    </div>
    
    <div class="footer">
      <p>CosmoCraft © 2026</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  private createSuspiciousActivityEmailTemplate(
    username: string,
    attempts: number,
    ipAddress: string
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0a1a; color: #fff; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; background: linear-gradient(135deg, #1a1a3e 0%, #0a0a1a 100%); }
    .content { background: #1a1a3e; padding: 30px; border-radius: 10px; margin-top: 20px; border: 2px solid #ff4444; }
    .alert { background: #330000; border-left: 4px solid #ff4444; padding: 15px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🚨</div>
      <h1>Подозрительная активность!</h1>
    </div>
    
    <div class="content">
      <h2>Внимание, ${this.escapeHtml(username)}!</h2>
      
      <div class="alert">
        <strong>Обнаружена попытка взлома вашего аккаунта!</strong>
      </div>
      
      <p>Зафиксировано <strong>${attempts} неудачных попыток входа</strong> с IP адреса:</p>
      <p style="text-align: center; font-family: monospace; font-size: 18px;">${this.escapeHtml(ipAddress)}</p>
      
      <p><strong>Рекомендации:</strong></p>
      <ul>
        <li>Смените пароль немедленно</li>
        <li>Включите двухфакторную аутентификацию</li>
        <li>Проверьте историю входов в настройках</li>
      </ul>
    </div>
    
    <div class="footer">
      <p>CosmoCraft © 2026</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
