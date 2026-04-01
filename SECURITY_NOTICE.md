# 🔐 Уведомление о безопасности / Security Notice

**Версия:** 1.0  
**Дата:** 2026-03-31  
**Статус:** Критически важно для всех разработчиков

---

## ⚠️ ВНИМАНИЕ: Ограничение распространения кода авторизации

Данный документ содержит важное уведомление об ограничениях на использование кода системы авторизации проекта CosmoCraft.

---

## 📋 Содержание

1. [Обзор](#обзор)
2. [Исключённые файлы](#исключённые-файлы)
3. [Причины исключения](#причины-исключения)
4. [Обязанности разработчиков](#обязанности-разработчиков)
5. [Инструкция по настройке](#инструкция-по-настройке)
6. [Юридическое уведомление](#юридическое-уведомление)

---

## 📌 Обзор

Система авторизации, аутентификации и управления сессиями пользователей **намеренно исключена** из репозитория и не распространяется вместе с основным кодом проекта.

Это решение принято в целях безопасности и требует от каждого разработчика/последователя **самостоятельной реализации или настройки** данной подсистемы.

---

## 📁 Исключённые файлы

Следующие файлы и директории **не подлежат распространению** через репозиторий:

### Серверный код авторизации
```
src/server/routes/auth.routes.ts          # HTTP маршруты авторизации
src/server/services/AuthService.ts        # Сервис аутентификации
src/server/services/EmailService.ts       # Сервис email-уведомлений
```

### Схемы базы данных
```
scripts/database/auth-schema.sql          # SQL схема таблиц авторизации
```

### Конфигурация безопасности
```
.env                                       # Переменные окружения (секреты)
security.env                               # Конфигурация безопасности
security.*.env                             # Дополнительные конфиги
```

### Публичные страницы
```
public/registration.html                   # Страница регистрации
public/verification.html                   # Страница подтверждения email
public/password-reset.html                 # Страница восстановления пароля
public/index.html                          # Страница входа
```

Эти файлы добавлены в `.gitignore` и **не должны коммититься** в репозиторий.

---

## 🔒 Причины исключения

### 1. Безопасность учётных данных

Код авторизации содержит:
- Алгоритмы хеширования паролей (bcrypt/argon2)
- Логику генерации и проверки JWT токенов
- Обработку секретных ключей
- Механизмы защиты от brute-force атак

Распространение этого кода может привести к:
- Утечке секретных ключей
- Возможности подбора уязвимостей в реализации
- Компрометации пользовательских данных

### 2. Уникальность реализации

Каждый развёртывание проекта должно иметь:
- Уникальные секретные ключи (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET)
- Собственную конфигурацию SMTP для email-рассылок
- Индивидуальные настройки безопасности
- Персональные сертификаты и ключи шифрования

### 3. Соответствие стандартам безопасности

Следование принципам:
- **OWASP Top 10** - защита от наиболее критичных уязвимостей
- **GDPR** - защита персональных данных пользователей
- **PCI DSS** - безопасное хранение учётных данных

### 4. Минимизация рисков

Исключение кода авторизации из репозитория:
- Снижает риск случайной утечки секретов
- Требует осознанной настройки каждым разработчиком
- Предотвращает использование одинаковых ключей в разных развёртываниях

---

## 👨‍💻 Обязанности разработчиков

Каждый разработчик, использующий этот проект, **обязан**:

### 1. Самостоятельная реализация

Реализовать или настроить:
- [ ] Систему регистрации пользователей
- [ ] Механизм аутентификации (login/logout)
- [ ] Подтверждение email адресов
- [ ] Восстановление пароля
- [ ] Управление сессиями
- [ ] Защиту от brute-force атак
- [ ] Rate limiting для API авторизации

### 2. Генерация секретов

Сгенерировать уникальные секреты:
```bash
# Access Token Secret (минимум 32 символа)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Refresh Token Secret (минимум 32 символа)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Настройка базы данных

Создать таблицы авторизации:
- `pilot_credentials` - учётные данные
- `pilot_sessions` - активные сессии
- `password_reset_codes` - коды сброса пароля
- `email_verification_codes` - коды подтверждения
- `login_attempts_log` - журнал попыток входа
- `security_events_log` - события безопасности
- `rate_limit_log` - rate limiting

### 4. Настройка email-сервера

Настроить SMTP для отправки:
- Кодов подтверждения регистрации
- Кодов восстановления пароля
- Уведомлений о безопасности

### 5. Обновление документации

Задокументировать:
- Используемые методы шифрования
- Настройки безопасности
- Процедуры восстановления доступа

---

## 📖 Инструкция по настройке

### Шаг 1: Создание таблиц БД

Создайте файл `scripts/database/auth-schema.sql` со следующей структурой:

```sql
USE cosmocraft;

-- Таблица учётных данных
CREATE TABLE IF NOT EXISTS `pilot_credentials` (
  `player_id` varchar(36) NOT NULL,
  `email` varchar(100) NOT NULL UNIQUE,
  `password_hash` varchar(255) NOT NULL,
  `password_salt` varchar(64) NOT NULL,
  `is_email_verified` tinyint(1) DEFAULT 0,
  `is_account_locked` tinyint(1) DEFAULT 0,
  `lock_until` timestamp NULL DEFAULT NULL,
  `failed_login_attempts` int DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`player_id`),
  FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE
);

-- Таблица сессий
CREATE TABLE IF NOT EXISTS `pilot_sessions` (
  `id` varchar(64) NOT NULL,
  `player_id` varchar(36) NOT NULL,
  `refresh_token_hash` varchar(255) NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `expires_at` timestamp NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE
);

-- Журнал попыток входа
CREATE TABLE IF NOT EXISTS `login_attempts_log` (
  `id` bigint AUTO_INCREMENT PRIMARY KEY,
  `player_id` varchar(36),
  `email` varchar(100),
  `ip_address` varchar(45) NOT NULL,
  `success` tinyint(1) DEFAULT 0,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP
);
```

### Шаг 2: Создание .env файла

Создайте файл `.env` в корне проекта:

```env
# База данных
DB_HOST=localhost
DB_USER=cosmocraft_user
DB_PASSWORD=ваш_уникальный_пароль
DB_NAME=cosmocraft

# JWT секреты (сгенерируйте новые!)
JWT_ACCESS_SECRET=ваш_секрет_для_access_токена_минимум_32_символа
JWT_REFRESH_SECRET=ваш_секрет_для_refresh_токена_минимум_32_символа
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Email (SMTP)
EMAIL_ENABLED=true
EMAIL_HOST=smtp.yourserver.com
EMAIL_PORT=587
EMAIL_USER=your_email@domain.com
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=noreply@yourdomain.com

# Безопасность
PASSWORD_MIN_LENGTH=8
REQUIRE_STRONG_PASSWORD=true
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15
```

### Шаг 3: Реализация AuthService

Создайте файл `src/server/services/AuthService.ts`:

```typescript
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { DatabaseManager } from '../storage/DatabaseManager';

export class AuthService {
  private db: DatabaseManager;
  
  constructor(db: DatabaseManager) {
    this.db = db;
  }
  
  // Хеширование пароля
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return await bcrypt.hash(password, salt);
  }
  
  // Проверка пароля
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }
  
  // Регистрация
  async register(username: string, email: string, password: string): Promise<any> {
    // Проверка существования email
    // Хеш пароля
    // Создание записи в БД
    // Отправка email подтверждения
  }
  
  // Вход
  async login(email: string, password: string): Promise<any> {
    // Проверка учётных данных
    // Проверка блокировки
    // Генерация JWT токенов
    // Создание сессии
  }
}
```

### Шаг 4: Создание маршрутов авторизации

Создайте файл `src/server/routes/auth.routes.ts`:

```typescript
import { Router } from 'express';
import { AuthService } from '../services/AuthService';

const router = Router();

// POST /api/auth/register - Регистрация
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  // Валидация и регистрация
});

// POST /api/auth/login - Вход
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  // Аутентификация
});

// POST /api/auth/logout - Выход
router.post('/logout', async (req, res) => {
  // Завершение сессии
});

export { router };
```

### Шаг 5: Создание HTML страниц

Создайте файлы в директории `public/`:

- `registration.html` - форма регистрации
- `index.html` - форма входа
- `verification.html` - подтверждение email
- `password-reset.html` - восстановление пароля

### Шаг 6: Тестирование

Проверьте работу системы:

```bash
# Инициализация БД
npm run db:init

# Запуск сервера
npm run dev

# Тестирование API
curl -X POST http://localhost:8001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"Test123!"}'
```

---

## ⚖️ Юридическое уведомление

### Ограничение ответственности

Автор проекта **не несёт ответственности** за:
- Неправильную реализацию системы авторизации
- Утечки пользовательских данных
- Несанкционированный доступ к аккаунтам
- Любой ущерб, возникший в результате использования проекта

### Требования к распространению

При распространении модифицированной версии проекта:
1. **Обязательно** включите этот файл (SECURITY_NOTICE.md) без изменений
2. **Запрещено** включать в репозиторий файлы авторизации из оригинального проекта
3. **Требуется** документировать собственные изменения в системе безопасности

### Лицензионные ограничения

Код системы авторизации:
- Не является открытым для свободного распространения
- Требует самостоятельной реализации или лицензирования
- Защищён авторским правом

---

## 📞 Контакты и поддержка

По вопросам, связанным с системой авторизации:
- Изучите документацию OWASP
- Проконсультируйтесь со специалистом по безопасности
- Обратитесь к официальным руководствам по JWT и bcrypt

---

## 📝 Чеклист для разработчиков

Перед запуском проекта убедитесь, что выполнено:

- [ ] Создан файл `.env` с уникальными секретами
- [ ] Сгенерированы JWT_ACCESS_SECRET и JWT_REFRESH_SECRET
- [ ] Созданы все таблицы авторизации в БД
- [ ] Настроен SMTP сервер для email-уведомлений
- [ ] Реализована валидация паролей (мин. 8 символов, сложность)
- [ ] Реализована защита от brute-force (блокировка после 5 попыток)
- [ ] Настроен rate limiting для API авторизации
- [ ] Протестированы все сценарии (регистрация, вход, восстановление)
- [ ] Включён HTTPS для продакшена
- [ ] Настроено логирование событий безопасности

---

**Помните:** Безопасность пользователей — ваша ответственность.

*Последнее обновление: 2026-03-31*
