# 🔐 Настройка безопасности CosmoCraft

## Содержание

1. [Админ-панель](#админ-панель)
2. [SMTP сервер](#smtp-сервер)
3. [База данных](#база-данных)
4. [Запуск сервера](#запуск-сервера)

---

## 🛡️ Админ-панель

### URL доступа

**Внутри сети:**
```
http://10.222.0.25:8001/admin/
http://cosmocraft.rupru.ru:8001/admin/
```

**Через HTTPS (внешний доступ):**
```
https://cosmocraft.rupru.ru/admin/
```

### Данные для входа по умолчанию

```
Логин: admin
Пароль: AdminPassword123!
```

### Сброс пароля администратора

Если пароль не подходит, выполните:

```bash
cd /home/father/project/cosmocraft
node scripts/set-admin-password.js "НовыйПароль123!"
```

Или напрямую через MySQL:

```sql
-- Сгенерировать хэш пароля
node -e "const bcrypt=require('bcrypt'); bcrypt.hash('НовыйПароль123!', 12).then(h=>console.log(h));"

-- Обновить в БД (замените ХЭШ на сгенерированный)
UPDATE admin_users 
SET password_hash = '$2b$12$...'
WHERE username = 'admin';
```

### Проверка работы

```bash
# Тест входа через API
curl -X POST http://localhost:8001/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"AdminPassword123!"}'
```

Ожидаемый ответ:
```json
{
  "success": true,
  "token": "eyJhbGci...",
  "message": "Вход выполнен успешно"
}
```

---

## 📧 SMTP сервер

### Проблема

SMTP сервер внутри сети доступен **только по IP** (`10.222.0.25`), так как DNS выведен наружу.

Порты:
- **25** (SMTP) - может быть заблокирован
- **587** (Submission) - рекомендуется
- **465** (SMTPS) - SSL/TLS
- **110** (POP3) - работает ✅
- **143** (IMAP) - работает ✅

### Проверка доступности

```bash
# Проверка портов
nc -zv 10.222.0.25 25
nc -zv 10.222.0.25 587
nc -zv mail.rupru.ru 587
```

### Настройка .env

**Вариант 1: SMTP внутри сети (если доступен)**
```env
EMAIL_ENABLED=true
EMAIL_HOST=10.222.0.25
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=noreply@rupru.ru
EMAIL_PASSWORD=ваш_пароль
EMAIL_FROM=noreply@rupru.ru
```

**Вариант 2: SMTP через внешний домен**
```env
EMAIL_ENABLED=true
EMAIL_HOST=mail.rupru.ru
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=noreply@rupru.ru
EMAIL_PASSWORD=ваш_пароль
EMAIL_FROM=noreply@rupru.ru
```

**Вариант 3: Email отключен (режим разработки)**
```env
EMAIL_ENABLED=false
```

В этом случае код верификации не отправляется, но регистрация работает.

### Тест отправки

```bash
# Проверка подключения к SMTP
telnet 10.222.0.25 587

# Должно быть:
# 220 ... Dovecot (Ubuntu)
# EHLO test
# 250-...
```

---

## 🗄️ База данных

### Инициализация

```bash
cd /home/father/project/cosmocraft
node scripts/database/init-database.js
```

Создаёт:
- 13 основных таблиц
- 8 таблиц авторизации
- 2 хранимые процедуры (rate limiting)

### Проверка таблиц авторизации

```sql
USE cosmocraft;

-- Таблицы
SHOW TABLES LIKE '%pilot%';
SHOW TABLES LIKE '%auth%';

-- Процедуры
SHOW PROCEDURE STATUS WHERE Db = 'cosmocraft';

-- Администраторы
SELECT username, email, role, is_active FROM admin_users;
```

### Сброс пароля пользователя

```sql
-- Найти пользователя
SELECT player_id, email FROM pilot_credentials WHERE email = 'user@example.com';

-- Сбросить пароль (нужно установить новый через API)
UPDATE pilot_credentials 
SET is_account_locked = 0, lock_until = NULL, failed_login_attempts = 0
WHERE email = 'user@example.com';
```

---

## 🚀 Запуск сервера

### Разработка

```bash
cd /home/father/project/cosmocraft
npm run dev
```

Сервер доступен:
- **WebSocket:** ws://localhost:8080
- **HTTP:** http://localhost:8001
- **Админка:** http://localhost:8001/admin/

### Продакшен (фоновый режим)

```bash
# Сборка
npm run build

# Запуск в фоне
nohup node dist/server/GameServer.js > /var/log/cosmocraft.log 2>&1 &

# Проверка
ps aux | grep GameServer
curl http://localhost:8001/admin/
```

### Остановка

```bash
pkill -f "node.*GameServer"
```

---

## 🔧 Диагностика

### Сервер не запускается

```bash
# Проверка портов
netstat -tlnp | grep -E '8080|8001'

# Проверка логов
tail -f /tmp/server.log

# Проверка БД
mysql -u prusakoviv -pDfhev1Fuenby cosmocraft -e "SELECT 1"
```

### Регистрация не работает

```bash
# Проверка таблиц
mysql -u prusakoviv -pDfhev1Fuenby cosmocraft -e "
  SELECT COUNT(*) FROM players;
  SELECT COUNT(*) FROM pilot_credentials;
  SHOW PROCEDURE STATUS WHERE Db = 'cosmocraft';
"

# Тест API
curl -X POST http://localhost:8001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"Test","email":"test@test.com","password":"Test123!"}'
```

### Админка не работает

```bash
# Проверка наличия админа
mysql -u prusakoviv -pDfhev1Fuenby cosmocraft -e "
  SELECT username, is_active FROM admin_users
"

# Сброс пароля
node scripts/set-admin-password.js "AdminPassword123!"

# Тест API
curl -X POST http://localhost:8001/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"AdminPassword123!"}'
```

---

## 📝 Чеклист развёртывания

- [ ] Инициализирована БД (`npm run db:init`)
- [ ] Создан администратор (пароль установлен)
- [ ] Настроен `.env` (секреты, SMTP)
- [ ] Проверены порты (8080, 8001 доступны)
- [ ] SMTP сервер доступен (если нужен email)
- [ ] Сервер запущен и работает
- [ ] Админка открывается в браузере
- [ ] Регистрация работает
- [ ] Вход работает

---

**Контакты поддержки:** admin@cosmocraft.rupru.ru
