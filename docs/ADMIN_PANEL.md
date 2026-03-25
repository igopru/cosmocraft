# 🎛️ Админ-панель CosmoCraft

## Обзор

Веб-интерфейс для управления сервером, игроками и настройками безопасности.

---

## 📋 Содержание

1. [Быстрый старт](#быстрый-старт)
2. [Возможности](#возможности)
3. [Роли и разрешения](#роли-и-разрешения)
4. [API эндпоинты](#api-эндпоинты)
5. [Управление настройками](#управление-настройками)
6. [2FA аутентификация](#2fa-аутентификация)
7. [Мониторинг](#мониторинг)

---

## 🚀 Быстрый старт

### 1. Инициализация БД

```bash
# Создать таблицы админ-панели
mysql -u prusakoviv -p cosmocraft < scripts/database/admin-schema.sql
```

### 2. Установка зависимостей

```bash
npm install
```

### 3. Настройка .env

```env
# JWT для админки
JWT_ADMIN_SECRET=ваш_секретный_ключ_для_админки

# Булевы переменные для включения/выключения функций
ADMIN_ENABLED=true
ADMIN_2FA_REQUIRED=false
ADMIN_EMAIL_VERIFICATION=false
```

### 4. Запуск сервера

```bash
npm run dev
```

### 5. Вход в админ-панель

**URL:** http://localhost:8001/admin/

**Учётные данные по умолчанию:**
- **Логин:** `admin`
- **Пароль:** `AdminPassword123!`

⚠️ **Смените пароль после первого входа!**

---

## ✨ Возможности

### 👥 Управление игроками

- ✅ Просмотр всех игроков
- ✅ Поиск и фильтрация
- ✅ Блокировка/разблокировка
- ✅ Удаление игроков
- ✅ Просмотр ресурсов и статистики
- ✅ Управление сессиями

### ⚙️ Настройки сервера

**Динамическое изменение без перезапуска:**

| Категория | Настройки |
|-----------|-----------|
| 🔐 Авторизация | Включить авторизацию, регистрация, email, 2FA |
| 🎮 Игра | Сложность, PvP, множитель ресурсов |
| 📧 Email | SMTP сервер, отправка уведомлений |
| 🛡️ Безопасность | Белый список IP, rate limiting, блокировки |

### 🛡️ Безопасность

- **Мониторинг подозрительной активности**
  - Множественные неудачные входы
  - Входы с разных IP
  - Подозрительные паттерны

- **Журнал действий администраторов**
  - Кто что изменил
  - Когда была блокировка
  - Какие настройки менялись

### 📊 Мониторинг в реальном времени

- **Онлайн игроки** (обновление каждые 30 сек)
- **Статистика сервера**
  - Всего игроков
  - Активные сессии
  - Входы за 24 часа
- **Активные миры**
- **Состояние астероидов**

---

## 🎭 Роли и разрешения

### Super Admin

**Все разрешения:**
- ✅ Управление игроками (бан/удаление)
- ✅ Управление настройками сервера
- ✅ Создание/удаление администраторов
- ✅ Просмотр всех логов
- ✅ Управление жалобами
- ✅ Доступ ко всем разделам

### Admin

**Разрешения:**
- ✅ Управление игроками
- ✅ Изменение настроек игры
- ✅ Просмотр логов действий
- ✅ Управление жалобами
- ❌ Создание администраторов

### Moderator

**Разрешения:**
- ✅ Бан/разбан игроков
- ✅ Управление жалобами
- ❌ Изменение настроек сервера
- ❌ Просмотр логов

---

## 🔌 API эндпоинты

### Публичные (без авторизации)

```typescript
POST /api/admin/login
{
  "username": "admin",
  "password": "password"
}

// Ответ:
{
  "success": true,
  "token": "eyJhbGc...",
  "admin": {
    "id": "...",
    "username": "admin",
    "role": "super_admin"
  }
}
```

### Защищённые (требуют JWT)

```typescript
// Проверка токена
GET /api/admin/me
Authorization: Bearer {token}

// Выход
POST /api/admin/logout
Authorization: Bearer {token}

// Статистика сервера
GET /api/admin/stats
Authorization: Bearer {token}

// Активные игроки
GET /api/admin/players/active
Authorization: Bearer {token}

// Все игроки
GET /api/admin/players
Authorization: Bearer {token}

// Бан игрока
POST /api/admin/players/:id/ban
Authorization: Bearer {token}
{
  "reason": "Нарушение правил",
  "durationMinutes": 60 // опционально
}

// Разбан игрока
POST /api/admin/players/:id/unban
Authorization: Bearer {token}

// Удаление игрока
DELETE /api/admin/players/:id
Authorization: Bearer {token}

// Настройки сервера
GET /api/admin/settings
Authorization: Bearer {token}

// Обновление настройки
PUT /api/admin/settings/:settingId
Authorization: Bearer {token}
{
  "value": "new_value"
}

// Журнал действий
GET /api/admin/logs
Authorization: Bearer {token}

// Подозрительная активность
GET /api/admin/security/suspicious
Authorization: Bearer {token}

// 2FA для игрока
POST /api/admin/players/:id/2fa
Authorization: Bearer {token}
{
  "enabled": true
}
```

---

## ⚙️ Управление настройками

### Категории настроек

#### general (Общие)

| ID | Описание | Тип | Пример |
|----|----------|-----|--------|
| `server_name` | Название сервера | string | "CosmoCraft Server" |
| `maintenance_mode` | Режим обслуживания | boolean | false |
| `max_players` | Максимум игроков | number | 100 |

#### auth (Авторизация)

| ID | Описание | Тип | Пример |
|----|----------|-----|--------|
| `auth_enabled` | Включить авторизацию | boolean | true |
| `auth_registration_enabled` | Разрешить регистрацию | boolean | true |
| `auth_2fa_enabled` | Двухфакторная аутентификация | boolean | false |
| `auth_2fa_required` | Требовать 2FA | boolean | false |
| `auth_email_verification` | Подтверждение email | boolean | true |

#### game (Игра)

| ID | Описание | Тип | Пример |
|----|----------|-----|--------|
| `game_difficulty` | Сложность | string | "normal" |
| `game_pvp_enabled` | PvP сражения | boolean | false |
| `game_resource_rate` | Множитель ресурсов | number | 1.0 |

#### email (Email)

| ID | Описание | Тип | Пример |
|----|----------|-----|--------|
| `email_enabled` | Включить email | boolean | false |
| `email_smtp_host` | SMTP сервер | string | "smtp.example.com" |
| `email_smtp_port` | SMTP порт | number | 587 |

#### security (Безопасность)

| ID | Описание | Тип | Пример |
|----|----------|-----|--------|
| `security_ip_whitelist_enabled` | Белый список IP | boolean | false |
| `security_rate_limit_enabled` | Rate limiting | boolean | true |
| `security_max_login_attempts` | Попыток входа | number | 5 |

---

## 🔐 2FA Аутентификация

### Включение 2FA для игрока

**Через админ-панель:**
1. Раздел "Безопасность"
2. Найти игрока
3. Нажать "Включить 2FA"
4. Отсканировать QR код
5. Ввести код из приложения

### Приложения для 2FA

- **Google Authenticator** (iOS/Android)
- **Authy** (iOS/Android/Desktop)
- **Microsoft Authenticator** (iOS/Android)
- **2FAS** (iOS/Android, open source)

### Резервные коды

При включении 2FA генерируются 10 резервных кодов:
- Сохраните в безопасном месте
- Каждый код можно использовать 1 раз
- Можно перегенерировать в настройках

---

## 📊 Мониторинг

### Dashboard (Обзор)

**Статистика в реальном времени:**
- Всего игроков
- Онлайн сейчас
- Активные сессии
- Входов за 24 часа

**Таблица активных игроков:**
- Имя и позиция
- Текущий сектор
- Количество ресурсов
- Время последнего входа

### Подозрительная активность

**Автоматическое обнаружение:**
- 5+ неудачных входов за 1 час
- Входы с 3+ разных IP
- 10+ запросов в минуту

**Действия:**
- Просмотр деталей
- Бан IP
- Уведомление игрока (email)

---

## 🛡️ Безопасность админ-панели

### Защита доступа

1. **JWT токены**
   - Время жизни: 8 часов
   - Автоматический выход по истечении

2. **HTTPS (для продакшена)**
   ```env
   ADMIN_HTTPS_ONLY=true
   ```

3. **IP Whitelist для админки**
   ```env
   ADMIN_IP_WHITELIST=127.0.0.1,192.168.1.1
   ```

4. **2FA для администраторов**
   ```env
   ADMIN_2FA_REQUIRED=true
   ```

### Логирование

**Все действия записываются:**
- Вход/выход
- Изменение настроек
- Блокировка игроков
- Удаление данных

**Просмотр логов:**
- Раздел "Журнал"
- Фильтр по дате
- Экспорт в CSV

---

## 🎮 Использование

### Бан игрока

1. Раздел "Игроки"
2. Нажать "Заблокировать"
3. Ввести причину (опционально)
4. Выбрать длительность (опционально)
5. Подтвердить

### Изменение настроек

**Переключатель (boolean):**
1. Раздел "Настройки"
2. Нажать на переключатель
3. Подтвердить изменение

**Текстовое поле:**
1. Изменить значение
2. Нажать Enter или кликнуть вне поля
3. Автоматическое сохранение

### Просмотр логов

1. Раздел "Журнал"
2. Фильтр по дате
3. Фильтр по типу действия
4. Экспорт (кнопка "Скачать CSV")

---

## 🔧 Настройка для продакшена

### 1. Смените учётные данные

```sql
-- Смена пароля администратора
UPDATE admin_users 
SET password_hash = (SELECT bcrypt('NewSecurePassword123!'))
WHERE username = 'admin';
```

### 2. Включите HTTPS

```env
ADMIN_HTTPS_ONLY=true
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

### 3. Ограничьте доступ по IP

```env
ADMIN_IP_WHITELIST=ваш.ip.адрес
ADMIN_IP_WHITELIST_ENABLED=true
```

### 4. Включите 2FA для администраторов

```env
ADMIN_2FA_REQUIRED=true
```

### 5. Настройте CORS

```env
ADMIN_CORS_ORIGINS=https://admin.cosmocraft.game
```

---

## 📝 Переменные окружения

```env
# Админ-панель
ADMIN_ENABLED=true
ADMIN_JWT_SECRET=ваш_секретный_ключ
ADMIN_SESSION_TIMEOUT_HOURS=8

# Безопасность
ADMIN_IP_WHITELIST_ENABLED=false
ADMIN_IP_WHITELIST=127.0.0.1
ADMIN_2FA_REQUIRED=false
ADMIN_HTTPS_ONLY=false

# CORS
ADMIN_CORS_ENABLED=true
ADMIN_CORS_ORIGINS=http://localhost:8001

# Логирование
ADMIN_LOG_ENABLED=true
ADMIN_LOG_LEVEL=info
ADMIN_LOG_MAX_AGE_DAYS=30
```

---

## 🐛 Отладка

### Включить подробное логирование

```env
ADMIN_LOG_LEVEL=debug
```

### Просмотр логов админ-панели

```bash
# Логи сервера
tail -f logs/admin.log

# Логи действий
mysql -u root -p cosmocraft -e "SELECT * FROM admin_actions_log ORDER BY created_at DESC LIMIT 50;"
```

### Сброс пароля администратора

```sql
-- Временный пароль: TempPass123!
UPDATE admin_users 
SET password_hash = '$2b$12$...' -- bcrypt хэш
WHERE username = 'admin';
```

---

## 📚 Дополнительные ресурсы

- [AUTHENTICATION.md](./AUTHENTICATION.md) - Система авторизации
- [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) - Безопасность сервера
- [DATABASE.md](./DATABASE.md) - База данных

---

**Управляйте сервером эффективно и безопасно! 🎛️**
