# 🔐 Система авторизации пилотов CosmoCraft

## Обзор

Комплексная система безопасности с защитой от взлома, двухфакторной аутентификацией и полным логированием.

---

## 📋 Содержание

1. [Архитектура безопасности](#архитектура-безопасности)
2. [База данных](#база-данных)
3. [Регистрация и вход](#регистрация-и-вход)
4. [JWT токены](#jwt-токены)
5. [Защита от атак](#защита-от-атак)
6. [Email уведомления](#email-уведомления)
7. [Белый список IP](#белый-список-ip)
8. [HTTPS настройка](#https-настройка)
9. [Мониторинг и логи](#мониторинг-и-логи)

---

## 🏗️ Архитектура безопасности

```
┌─────────────────────────────────────────────────────────┐
│                    Клиент (браузер)                     │
│  - Логин/пароль                                         │
│  - JWT токены (access + refresh)                        │
│  - HTTPS соединение                                     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Express + Helmet + Rate Limit              │
│  - Проверка заголовков безопасности                     │
│  - Ограничение частоты запросов                         │
│  - CORS политика                                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   AuthService                           │
│  - Хеширование паролей (bcrypt)                         │
│  - JWT генерация/верификация                            │
│  - Проверка блокировок                                  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   MySQL Database                        │
│  - pilot_credentials (хеши паролей)                     │
│  - pilot_sessions (активные сессии)                     │
│  - login_attempts_log (журнал входов)                   │
│  - security_events_log (события безопасности)           │
└─────────────────────────────────────────────────────────┘
```

---

## 🗄️ База данных

### Таблицы авторизации

#### `pilot_credentials`
Учётные данные пилотов.

| Поле | Тип | Описание |
|------|-----|----------|
| `player_id` | varchar(36) | UUID игрока (PRIMARY KEY) |
| `email` | varchar(100) | Email (уникальный) |
| `password_hash` | varchar(255) | Хешированный пароль |
| `password_salt` | varchar(64) | Соль для хеширования |
| `is_email_verified` | tinyint(1) | Email подтверждён |
| `is_account_locked` | tinyint(1) | Аккаунт заблокирован |
| `lock_until` | timestamp | До когда заблокирован |
| `failed_login_attempts` | int | Счётчик неудачных входов |

#### `pilot_sessions`
Активные сессии.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | varchar(64) | UUID сессии |
| `player_id` | varchar(36) | Ссылка на игрока |
| `refresh_token_hash` | varchar(255) | Хэш refresh токена |
| `ip_address` | varchar(45) | IP адрес входа |
| `user_agent` | text | Браузер/устройство |
| `device_info` | json | Информация об устройстве |
| `expires_at` | timestamp | Истекает |
| `last_activity` | timestamp | Последняя активность |

#### `login_attempts_log`
Журнал всех попыток входа.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | bigint | ID записи |
| `player_id` | varchar(36) | Игрок (если найден) |
| `email` | varchar(100) | Введённый email |
| `ip_address` | varchar(45) | IP адрес |
| `user_agent` | text | Браузер |
| `country` | varchar(50) | Страна (GeoIP) |
| `city` | varchar(100) | Город (GeoIP) |
| `success` | tinyint(1) | Успешный вход |
| `failure_reason` | enum | Причина неудачи |
| `session_id` | varchar(64) | ID сессии (если успех) |
| `created_at` | timestamp | Время попытки |

#### `password_reset_codes`
Коды сброса пароля.

#### `email_verification_codes`
Коды подтверждения email.

#### `ip_whitelist`
Белый список IP адресов.

#### `security_events_log`
Все события безопасности.

---

## 🚪 Регистрация и вход

### Регистрация

```typescript
POST /api/auth/register
Content-Type: application/json

{
  "username": "Pilot1",
  "email": "pilot@example.com",
  "password": "SecurePass123!"
}
```

**Процесс:**
1. Валидация пароля (мин. 8 символов, сложность)
2. Проверка уникальности email
3. Хеширование пароля (bcrypt с солью)
4. Создание игрока в БД
5. Генерация кода подтверждения email
6. Отправка email с кодом

**Ответ:**
```json
{
  "success": true,
  "playerId": "uuid...",
  "message": "Проверьте email для подтверждения"
}
```

### Вход

```typescript
POST /api/auth/login
Content-Type: application/json

{
  "email": "pilot@example.com",
  "password": "SecurePass123!"
}
```

**Процесс:**
1. Проверка rate limit (IP)
2. Поиск учётных данных по email
3. Проверка блокировки аккаунта
4. Проверка пароля (bcrypt.compare)
5. Проверка подтверждения email
6. Проверка IP в белом списке (если включено)
7. Генерация JWT токенов
8. Создание сессии
9. Логирование входа

**Ответ:**
```json
{
  "success": true,
  "tokens": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresIn": 900
  }
}
```

### Выход

```typescript
POST /api/auth/logout
Authorization: Bearer {accessToken}

{
  "sessionId": "uuid..."
}
```

---

## 🔑 JWT токены

### Access Token
- **Время жизни:** 15 минут
- **Назначение:** Доступ к API
- **Хранение:** localStorage / sessionStorage

**Содержимое:**
```json
{
  "playerId": "uuid...",
  "sessionId": "uuid...",
  "type": "access",
  "iat": 1234567890,
  "exp": 1234568790
}
```

### Refresh Token
- **Время жизни:** 7 дней
- **Назначение:** Обновление access токена
- **Хранение:** httpOnly cookie / БД (хэш)

**Содержимое:**
```json
{
  "playerId": "uuid...",
  "sessionId": "uuid...",
  "type": "refresh",
  "iat": 1234567890,
  "exp": 1235172690
}
```

### Обновление токена

```typescript
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGc..."
}
```

**Ответ:**
```json
{
  "accessToken": "новый access токен",
  "refreshToken": "новый refresh токен",
  "expiresIn": 900
}
```

---

## 🛡️ Защита от атак

### Brute Force (перебор паролей)

**Меры защиты:**
1. **Блокировка после 5 неудачных попыток**
   - Длительность: 15 минут
   - Сброс при успешном входе

2. **Rate Limiting**
   - 100 запросов в 15 минут
   - На уровень IP и email

3. **Логирование всех попыток**
   - IP адрес
   - User-Agent
   - Причина неудачи

4. **Уведомления о подозрительной активности**
   - Email при 10+ неудачных попытках
   - Email при входе с нового IP

### SQL Injection

**Меры защиты:**
1. Параметризованные запросы
2. Валидация всех входных данных
3. ORM/Driver с защитой

### XSS (Cross-Site Scripting)

**Меры защиты:**
1. Helmet.js заголовки
2. Content-Security-Policy
3. Санитизация вывода

### CSRF (Cross-Site Request Forgery)

**Меры защиты:**
1. CSRF токены (для форм)
2. SameSite cookies
3. Проверка Origin заголовка

---

## 📧 Email уведомления

### Настройка SMTP

```env
EMAIL_ENABLED=true
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your_email@example.com
EMAIL_PASSWORD=your_password
EMAIL_FROM=noreply@cosmocraft.game
EMAIL_FROM_NAME=CosmoCraft
```

### Типы уведомлений

1. **Подтверждение регистрации**
   - 6-значный код
   - Срок действия: 30 минут

2. **Сброс пароля**
   - 6-значный код
   - Срок действия: 30 минут
   - Максимум попыток: 3

3. **Подтверждение IP**
   - При добавлении в белый список
   - 6-значный код

4. **Вход с нового устройства**
   - Информация об устройстве
   - IP адрес
   - Местоположение (GeoIP)

5. **Подозрительная активность**
   - При 10+ неудачных попытках
   - IP атаки

---

## 🌐 Белый список IP

### Включение

```env
IP_WHITELIST_ENABLED=true
```

### Добавление IP

```typescript
POST /api/auth/ip-whitelist
Authorization: Bearer {accessToken}

{
  "description": "Домашний компьютер"
}
```

**Процесс:**
1. Получение IP из запроса
2. Создание записи в БД (is_confirmed = FALSE)
3. Генерация кода подтверждения
4. Отправка email с кодом

### Подтверждение IP

```typescript
POST /api/auth/ip-whitelist/confirm
Authorization: Bearer {accessToken}

{
  "code": "123456"
}
```

После подтверждения IP добавляется в белый список.

---

## 🔒 HTTPS настройка

### Для разработки (локально)

```env
HTTPS_ENABLED=false
```

### Для продакшена

**Вариант 1: Node.js терминирует SSL**

```env
HTTPS_ENABLED=true
SSL_CERT_PATH=/etc/ssl/certs/cosmocraft.crt
SSL_KEY_PATH=/etc/ssl/private/cosmocraft.key
```

**Вариант 2: Reverse Proxy (рекомендуется)**

Nginx конфигурация:
```nginx
server {
    listen 80;
    server_name cosmocraft.game;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cosmocraft.game;

    ssl_certificate /etc/letsencrypt/live/cosmocraft.game/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cosmocraft.game/privkey.pem;

    # Безопасные настройки SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 📊 Мониторинг и логи

### Представления БД

#### `recent_failed_logins`
Неудачные попытки за последний час.

```sql
SELECT * FROM recent_failed_logins;
```

#### `active_player_sessions`
Активные сессии игроков.

```sql
SELECT * FROM active_player_sessions;
```

#### `suspicious_activity`
Подозрительная активность.

```sql
SELECT * FROM suspicious_activity;
```

### Хранимые процедуры

#### `check_rate_limit`
Проверка и логирование rate limit.

```sql
CALL check_rate_limit('192.168.1.1', 'ip', 'login', 100, 15);
```

#### `handle_failed_login`
Обработка неудачного входа.

```sql
CALL handle_failed_login('player-uuid', '192.168.1.1');
```

---

## ⚙️ Конфигурация безопасности

### Переменные окружения

```env
# JWT
JWT_ACCESS_SECRET=ваш_секретный_ключ
JWT_REFRESH_SECRET=ваш_секретный_ключ
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Безопасность
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15
PASSWORD_MIN_LENGTH=8
REQUIRE_STRONG_PASSWORD=true
SESSION_TIMEOUT_DAYS=30
RATE_LIMIT_WINDOW_MINUTES=15
RATE_LIMIT_MAX_REQUESTS=100

# Логирование
LOG_LEVEL=info
LOG_REQUESTS=false
```

---

## 🎮 API эндпоинты

### Публичные (не требуют авторизации)

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/login` | Вход |
| POST | `/api/auth/refresh` | Обновление токена |
| POST | `/api/auth/forgot-password` | Запрос сброса пароля |
| POST | `/api/auth/reset-password` | Сброс пароля по коду |
| POST | `/api/auth/verify-email` | Подтверждение email |

### Защищённые (требуют JWT)

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/api/auth/logout` | Выход |
| GET | `/api/auth/me` | Информация о пилоте |
| GET | `/api/auth/sessions` | Активные сессии |
| DELETE | `/api/auth/sessions/:id` | Завершить сессию |
| GET | `/api/auth/login-history` | История входов |
| POST | `/api/auth/ip-whitelist` | Добавить IP |
| POST | `/api/auth/ip-whitelist/confirm` | Подтвердить IP |
| DELETE | `/api/auth/ip-whitelist/:id` | Удалить IP |

---

## 🔧 Установка и настройка

### 1. Установка зависимостей

```bash
npm install
```

### 2. Инициализация БД

```bash
# Основная схема
npm run db:init

# Схема авторизации
npm run db:init-auth
```

### 3. Настройка .env

```bash
cp .env.example .env
# Отредактируйте .env, установите секретные ключи
```

### 4. Генерация секретных ключей

```bash
# Access secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Refresh secret (повторите для второго ключа)
```

### 5. Запуск

```bash
npm run dev
```

---

## 🚨 Рекомендации по безопасности

### Обязательно для продакшена

1. **Смените все секретные ключи**
   - JWT_ACCESS_SECRET
   - JWT_REFRESH_SECRET
   - OBFUSCATION_SECRET

2. **Включите HTTPS**
   - Используйте Let's Encrypt
   - Настройте редирект HTTP → HTTPS

3. **Включите email уведомления**
   - Настройте SMTP сервер
   - Протестируйте отправку

4. **Включите белый список IP** (опционально)
   - Для критических аккаунтов

5. **Настройте мониторинг**
   - Alerts при подозрительной активности
   - Daily отчёты о входах

6. **Регулярные бэкапы**
   ```bash
   npm run db:backup
   ```

7. **Обновляйте зависимости**
   ```bash
   npm audit fix
   npm update
   ```

---

## 📝 Чеклист безопасности

- [ ] Сменены все секретные ключи
- [ ] Включён HTTPS
- [ ] Настроен SMTP для email
- [ ] Включено логирование
- [ ] Настроен rate limiting
- [ ] Включена валидация паролей
- [ ] Настроены бэкапы БД
- [ ] Проверены CORS настройки
- [ ] Включены security заголовки (Helmet)
- [ ] Настроен мониторинг

---

**Безопасность пилотов - приоритет CosmoCraft! 🚀**
