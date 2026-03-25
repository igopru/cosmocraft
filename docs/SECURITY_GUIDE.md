# 🛡️ Руководство по безопасности сервера CosmoCraft

## Обзор

Полное руководство по защите сервера от атак и уязвимостей.

---

## 📋 Содержание

1. [Контрольный список безопасности](#контрольный-список)
2. [Настройка сервера](#настройка-сервера)
3. [Защита базы данных](#защита-базы-данных)
4. [Безопасность приложения](#безопасность-приложения)
5. [Мониторинг и реагирование](#мониторинг-и-реагирование)
6. [Резервное копирование](#резервное-копирование)
7. [План действий при инцидентах](#план-действий-при-инцидентах)

---

## ✅ Контрольный список

### Критически важно (сделать немедленно)

- [ ] Сменить все пароли по умолчанию
- [ ] Сгенерировать новые секретные ключи JWT
- [ ] Включить HTTPS (SSL сертификаты)
- [ ] Настроить firewall (UFW/iptables)
- [ ] Отключить root login по SSH
- [ ] Включить fail2ban
- [ ] Настроить автоматические обновления безопасности

### Важно (сделать в первую неделю)

- [ ] Настроить мониторинг логов
- [ ] Включить email уведомления о входах
- [ ] Настроить белый список IP
- [ ] Создать политику паролей
- [ ] Настроить резервное копирование
- [ ] Провести аудит безопасности

### Рекомендуется (постоянно)

- [ ] Регулярно обновлять зависимости
- [ ] Проводить penetration testing
- [ ] Анализировать логи безопасности
- [ ] Обновлять документацию
- [ ] Обучать пользователей

---

## 🖥️ Настройка сервера

### 1. Обновление системы

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y
sudo apt dist-upgrade -y

# Автоматические обновления безопасности
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

### 2. Настройка firewall (UFW)

```bash
# Установка
sudo apt install ufw

# Настройка правил
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Разрешить SSH (измените порт если используете другой)
sudo ufw allow 22/tcp

# Разрешить HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Разрешить порт приложения
sudo ufw allow 8080/tcp

# Включить firewall
sudo ufw enable
sudo ufw status verbose
```

### 3. Настройка SSH

```bash
# Редактировать конфиг
sudo nano /etc/ssh/sshd_config

# Изменения:
Port 2222                    # Смените порт
PermitRootLogin no           # Запретить root login
PasswordAuthentication no    # Только ключи
PubkeyAuthentication yes     # Ключи SSH
AllowUsers cosmocraft        # Только нужные пользователи
MaxAuthTries 3               # Максимум попыток
ClientAliveInterval 300      # Таймаут бездействия
ClientAliveCountMax 2        # Максимум проверок

# Перезапуск SSH
sudo systemctl restart sshd
```

### 4. Fail2ban (защита от перебора)

```bash
# Установка
sudo apt install fail2ban

# Конфигурация
sudo nano /etc/fail2ban/jail.local
```

**Конфигурация:**
```ini
[DEFAULT]
bantime = 3600              # 1 час блокировки
findtime = 600              # 10 минут окно
maxretry = 5                # 5 попыток

[sshd]
enabled = true
port = 2222
logpath = /var/log/auth.log

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 10
```

```bash
# Перезапуск
sudo systemctl restart fail2ban
sudo fail2ban-client status
```

### 5. Настройка Nginx (reverse proxy)

```nginx
server {
    listen 80;
    server_name cosmocraft.game;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cosmocraft.game;

    # SSL сертификаты
    ssl_certificate /etc/letsencrypt/live/cosmocraft.game/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cosmocraft.game/privkey.pem;

    # Безопасные настройки SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';" always;

    # Скрыть версию nginx
    server_tokens off;

    # Ограничение размера запроса
    client_max_body_size 10M;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=one:10m rate=10r/s;
    limit_req zone=one burst=20 nodelay;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Таймауты
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Блокировка чувствительных путей
    location ~ /\. {
        deny all;
    }

    location ~* \.(git|svn|env) {
        deny all;
    }
}
```

### 6. SSL сертификаты (Let's Encrypt)

```bash
# Установка Certbot
sudo apt install certbot python3-certbot-nginx

# Получение сертификата
sudo certbot --nginx -d cosmocraft.game -d www.cosmocraft.game

# Автоматическое обновление
sudo certbot renew --dry-run

# Cron для автообновления
sudo crontab -e
# 0 3 * * * certbot renew --quiet
```

---

## 🗄️ Защита базы данных

### 1. Безопасность MySQL

```bash
# Запуск безопасной установки
sudo mysql_secure_installation
```

**Рекомендации:**
- Установить пароль для root
- Удалить анонимных пользователей
- Запретить удалённый root login
- Удалить тестовые БД

### 2. Создание пользователя БД

```sql
-- Только локальный доступ
CREATE USER 'cosmocraft_user'@'localhost' IDENTIFIED BY 'очень_сложный_пароль';

-- Ограниченные права
GRANT SELECT, INSERT, UPDATE, DELETE ON cosmocraft.* TO 'cosmocraft_user'@'localhost';
FLUSH PRIVILEGES;
```

### 3. Настройка MySQL

```ini
# /etc/mysql/mysql.conf.d/mysqld.cnf

[mysqld]
# Только локальный доступ
bind-address = 127.0.0.1

# Безопасность
skip-symbolic-links
skip-show-database

# Логирование
general_log = 1
general_log_file = /var/log/mysql/mysql.log
slow_query_log = 1
slow_query_log_file = /var/log/mysql/mysql-slow.log
long_query_time = 2
log-error = /var/log/mysql/error.log
```

### 4. Резервное копирование БД

```bash
#!/bin/bash
# /usr/local/bin/backup-cosmocraft.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/cosmocraft"
DB_NAME="cosmocraft"
DB_USER="root"

# Создание бэкапа
mysqldump -u $DB_USER -p'пароль' \
  --single-transaction \
  --quick \
  --lock-tables=false \
  $DB_NAME > $BACKUP_DIR/db_$DATE.sql

# Сжатие
gzip $BACKUP_DIR/db_$DATE.sql

# Удаление старых бэкапов (старше 30 дней)
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete

# Копирование на удалённый сервер (опционально)
# rsync -avz $BACKUP_DIR/db_$DATE.sql.gz user@backup-server:/backups/
```

```bash
# Cron для ежедневного бэкапа
sudo crontab -e
# 0 2 * * * /usr/local/bin/backup-cosmocraft.sh
```

---

## 🔐 Безопасность приложения

### 1. Переменные окружения

```bash
# Никогда не храните секреты в коде!
# Используйте .env файлы с правами 600

chmod 600 .env
chown cosmocraft:cosmocraft .env
```

### 2. Генерация секретных ключей

```bash
# JWT секреты (минимум 32 байта)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Для .env:
JWT_ACCESS_SECRET=результат_команды
JWT_REFRESH_SECRET=другой_результат
```

### 3. Helmet.js заголовки

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws://localhost:8080"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
```

### 4. Express Rate Limit

```typescript
import rateLimit from 'express-rate-limit';

// Общий rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // 100 запросов
  message: 'Слишком много запросов, попробуйте позже',
  standardHeaders: true,
  legacyHeaders: false,
});

// Для авторизации (строже)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 попыток входа
  message: 'Слишком много попыток входа',
  skipSuccessfulRequests: true,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/', limiter);
```

### 5. Валидация входных данных

```typescript
import { body, param, query, validationResult } from 'express-validator';

// Пример валидации регистрации
app.post('/api/auth/register',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/),
  body('username').isLength({ min: 3, max: 20 }).escape(),
  
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // Обработка...
  }
);
```

### 6. Логирование

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Логирование запросов
app.use((req, res, next) => {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});
```

---

## 📊 Мониторинг и реагирование

### 1. Мониторинг логов

```bash
# Установка ELK Stack (Elasticsearch, Logstash, Kibana)
# Или используйте более лёгкое решение:

# Promtail + Loki + Grafana
docker run -d --name=loki grafana/loki:latest
docker run -d --name=grafana grafana/grafana:latest
```

### 2. Alerts для подозрительной активности

```sql
-- Проверка неудачных входов
SELECT ip_address, COUNT(*) as attempts
FROM login_attempts_log
WHERE success = 0
  AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
GROUP BY ip_address
HAVING attempts >= 10;

-- Проверка множественных сессий
SELECT player_id, COUNT(*) as session_count
FROM pilot_sessions
WHERE expires_at > NOW()
GROUP BY player_id
HAVING session_count >= 5;
```

### 3. Dashboard Grafana

**Метрики для отслеживания:**
- Количество входов (успешные/неудачные)
- Активные сессии
- Использование CPU/RAM
- Response time API
- Ошибки 4xx/5xx

---

## 💾 Резервное копирование

### Стратегия 3-2-1

- **3** копии данных
- **2** разных типа носителей
- **1** копия вне площадки

### Скрипт бэкапа

```bash
#!/bin/bash
# /usr/local/bin/full-backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/cosmocraft"
APP_DIR="/home/cosmocraft/project"

# Бэкап БД
mysqldump -u root -p'пароль' cosmocraft | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Бэкап файлов
tar -czf $BACKUP_DIR/files_$DATE.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='logs' \
  -C $APP_DIR .

# Бэкап .env (секреты!)
tar -czf $BACKUP_DIR/env_$DATE.tar.gz $APP_DIR/.env

# Шифрование бэкапа (опционально)
# openssl enc -aes-256-cbc -salt -in $BACKUP_DIR/db_$DATE.sql.gz -out $BACKUP_DIR/db_$DATE.sql.gz.enc

# Удаление старых бэкапов
find $BACKUP_DIR -mtime +30 -delete

# Логирование
echo "$(date): Backup completed" >> /var/log/backup.log
```

---

## 🚨 План действий при инцидентах

### 1. Обнаружение атаки

**Признаки:**
- Множественные неудачные входы
- Необычная активность с одного IP
- Подозрительные запросы в логах
- Увеличение нагрузки на сервер

### 2. Немедленные действия

```bash
# 1. Блокировка IP
sudo ufw deny from 192.168.1.100

# 2. Проверка активных сессий
mysql -u root -p -e "SELECT * FROM cosmocraft.pilot_sessions WHERE ip_address = '192.168.1.100';"

# 3. Завершение всех сессий атакующего
mysql -u root -p -e "DELETE FROM cosmocraft.pilot_sessions WHERE ip_address = '192.168.1.100';"

# 4. Проверка логов
tail -f /var/log/nginx/access.log | grep 192.168.1.100
```

### 3. После атаки

1. **Анализ логов**
   - Определить вектор атаки
   - Оценить ущерб
   - Найти уязвимости

2. **Устранение**
   - Закрыть уязвимости
   - Обновить правила firewall
   - Сменить скомпрометированные пароли

3. **Документирование**
   - Записать время атаки
   - Сохранить логи
   - Создать отчёт

4. **Уведомление**
   - Уведомить затронутых пользователей
   - Сообщить в поддержку (если нужно)

---

## 📚 Дополнительные ресурсы

### Инструменты

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Mozilla Observatory](https://observatory.mozilla.org/)
- [SSL Labs Test](https://www.ssllabs.com/ssltest/)

### Книги

- "The Web Application Hacker's Handbook"
- "Building Secure & Reliable Systems" (Google)

### Курсы

- OWASP Security Testing Guide
- Coursera: Cybersecurity Specialization

---

## ✅ Финальный чеклист

- [ ] Все критические настройки применены
- [ ] Firewall настроен и включён
- [ ] HTTPS работает
- [ ] Бэкапы настроены и тестируются
- [ ] Мониторинг активен
- [ ] Команда обучена
- [ ] План инцидентов задокументирован

---

**Безопасность - это процесс, а не результат! Постоянно улучшайте защиту! 🛡️**
