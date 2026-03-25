# 🗄️ База данных MySQL - CosmoCraft

## Обзор

CosmoCraft использует **MySQL 8.0+** для хранения данных об игроках, мирах, астероидах и станциях.

---

## 📋 Требования

- **MySQL:** 8.0+
- **Node.js:** 18+
- **Драйвер:** mysql2 (npm пакет)

---

## 🚀 Быстрая установка

### 1. Установка MySQL (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install mysql-server-8.0

# Проверка статуса
sudo systemctl status mysql

# Запуск если не запущен
sudo systemctl start mysql
sudo systemctl enable mysql
```

### 2. Создание базы данных

```bash
# Вход в MySQL
mysql -u root -p

# Создание БД
CREATE DATABASE cosmocraft 
  DEFAULT CHARACTER SET utf8mb4 
  DEFAULT COLLATE utf8mb4_unicode_ci;

# Создание пользователя
CREATE USER 'cosmocraft_user'@'localhost' IDENTIFIED BY 'your_secure_password';

# Предоставление прав
GRANT ALL PRIVILEGES ON cosmocraft.* TO 'cosmocraft_user'@'localhost';
FLUSH PRIVILEGES;

# Выход
EXIT;
```

### 3. Настройка .env

```env
# База данных
DB_HOST=localhost
DB_USER=cosmocraft_user
DB_PASSWORD=your_secure_password
DB_NAME=cosmocraft

# Сервер
SERVER_PORT=8080
CLIENT_PORT=8001
```

### 4. Установка зависимостей

```bash
cd ~/project/cosmocraft
npm install mysql2
```

---

## 📊 Схема базы данных

### Таблица: `players`

Информация об игроках.

```sql
CREATE TABLE `players` (
  `id` varchar(36) NOT NULL,                    -- UUID игрока
  `username` varchar(50) NOT NULL,              -- Имя игрока (уникальное)
  `email` varchar(100) DEFAULT NULL,            -- Email (опционально)
  `password_hash` varchar(255) DEFAULT NULL,    -- Хэш пароля (для будущей авторизации)
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,  -- Дата регистрации
  `last_login` timestamp NULL DEFAULT NULL,     -- Последний вход
  `is_online` tinyint(1) DEFAULT 0,             -- Онлайн статус
  `current_sector_id` varchar(36) DEFAULT NULL, -- Текущий сектор
  `position_x` float DEFAULT 0,                 -- Позиция X
  `position_y` float DEFAULT 0,                 -- Позиция Y
  `position_z` float DEFAULT 500,               -- Позиция Z (над звездой)
  `rotation_y` float DEFAULT 0,                 -- Поворот Y
  `ship_type` varchar(50) DEFAULT 'starter',    -- Тип корабля
  `ship_health` int DEFAULT 100,                -- Здоровье корабля
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_players_online` (`is_online`),
  KEY `idx_players_sector` (`current_sector_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Индексы:**
- `PRIMARY KEY (id)` - быстрый поиск по UUID
- `UNIQUE KEY (username)` - уникальность имён
- `KEY (is_online)` - фильтрация онлайн игроков
- `KEY (current_sector_id)` - поиск по сектору

---

### Таблица: `player_resources`

Ресурсы игроков (металл, кремний, лёд, редкие).

```sql
CREATE TABLE `player_resources` (
  `player_id` varchar(36) NOT NULL,                    -- Ссылка на players.id
  `resource_type` enum('metal','silicon','ice','rare') NOT NULL,  -- Тип ресурса
  `amount` bigint DEFAULT 0,                           -- Количество
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`player_id`,`resource_type`),
  CONSTRAINT `player_resources_ibfk_1` 
    FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Особенности:**
- **Составной первичный ключ:** `(player_id, resource_type)`
- **Внешний ключ:** CASCADE delete (при удалении игрока ресурсы удаляются)
- **Ресурсы по умолчанию:** 1000 металла, 500 кремния, 300 льда, 100 редких

---

### Таблица: `worlds`

Миры (каждый мир имеет уникальный номер и seed).

```sql
CREATE TABLE `worlds` (
  `id` varchar(36) NOT NULL,                    -- UUID мира
  `seed` int NOT NULL,                          -- Seed для генерации
  `world_number` int NOT NULL,                  -- Номер мира (1, 2, 3...)
  `name` varchar(100) DEFAULT NULL,             -- Название мира
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,   -- Когда завершён
  `completed_by` varchar(36) DEFAULT NULL,      -- Кто завершил
  `status` enum('active','completed','archived') DEFAULT 'active',
  `difficulty_level` int DEFAULT 1,             -- Уровень сложности
  `special_features` json DEFAULT NULL,         -- Особенности (JSON)
  
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### Таблица: `asteroids`

Астероиды в мире.

```sql
CREATE TABLE `asteroids` (
  `id` varchar(36) NOT NULL,                    -- UUID астероида
  `field_id` varchar(36) DEFAULT NULL,          -- Поле астероидов (опционально)
  `type` enum('metallic','silicon','icy','rare') NOT NULL,  -- Тип астероида
  `position_x` float NOT NULL,                  -- Позиция X
  `position_y` float NOT NULL,                  -- Позиция Y
  `position_z` float NOT NULL,                  -- Позиция Z
  `rotation_x` float DEFAULT 0,                 -- Вращение X
  `rotation_y` float DEFAULT 0,                 -- Вращение Y
  `rotation_z` float DEFAULT 0,                 -- Вращение Z
  `scale` float DEFAULT 1,                      -- Масштаб
  `health` int DEFAULT 100,                     -- Текущее здоровье
  `max_health` int DEFAULT 100,                 -- Максимальное здоровье
  `metal_amount` int DEFAULT 0,                 -- Металл внутри
  `silicon_amount` int DEFAULT 0,               -- Кремний внутри
  `ice_amount` int DEFAULT 0,                   -- Лёд внутри
  `rare_amount` int DEFAULT 0,                  -- Редкие ресурсы
  `is_depleted` tinyint(1) DEFAULT 0,           -- Истощён ли
  `depletion_time` timestamp NULL DEFAULT NULL, -- Когда истощён
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Типы астероидов:**
- `metallic` - металлический (серый)
- `silicon` - кремниевый (синий)
- `icy` - ледяной (голубой)
- `rare` - редкий (оранжевый)

---

### Остальные таблицы

| Таблица | Описание |
|---------|----------|
| `asteroid_fields` | Поля астероидов (группы) |
| `blueprints` | Чертежи станций |
| `blueprint_comments` | Комментарии к чертежам |
| `blueprint_ratings` | Рейтинги чертежей |
| `chat_messages` | Сообщения чата |
| `constructions` | Постройки |
| `game_events` | Игровые события |
| `mining_operations` | Операции добычи |
| `module_connections` | Соединения модулей |
| `player_legacy` | Наследие игроков |
| `player_modifications` | Модификации игрока |
| `respawn_queue` | Очередь респавна |
| `sectors` | Сектора космоса |
| `star_system` | Звёздная система |
| `station_inventory` | Инвентарь станции |
| `station_modules` | Модули станции |
| `stations` | Станции |
| `world_events` | События мира |
| `world_progress` | Прогресс в мире |

---

## 🔧 SQL скрипты

### Создание БД и пользователя

```sql
-- Создание базы данных
CREATE DATABASE IF NOT EXISTS cosmocraft 
  DEFAULT CHARACTER SET utf8mb4 
  DEFAULT COLLATE utf8mb4_unicode_ci;

-- Создание пользователя
CREATE USER IF NOT EXISTS 'cosmocraft_user'@'localhost' 
  IDENTIFIED BY 'your_secure_password';

-- Предоставление прав
GRANT ALL PRIVILEGES ON cosmocraft.* TO 'cosmocraft_user'@'localhost';
FLUSH PRIVILEGES;

-- Использование БД
USE cosmocraft;
```

### Инициализация ресурсов игрока

```sql
-- Добавить начальные ресурсы новому игроку
INSERT INTO player_resources (player_id, resource_type, amount)
VALUES 
  ('{player_id}', 'metal', 1000),
  ('{player_id}', 'silicon', 500),
  ('{player_id}', 'ice', 300),
  ('{player_id}', 'rare', 100)
ON DUPLICATE KEY UPDATE amount = VALUES(amount);
```

### Поиск астероидов в радиусе

```sql
-- Получить 100 ближайших астероидов в радиусе
SELECT * FROM asteroids
WHERE is_depleted = FALSE
  AND SQRT(
    POW(position_x - :centerX, 2) + 
    POW(position_y - :centerY, 2) + 
    POW(position_z - :centerZ, 2)
  ) < :radius
ORDER BY SQRT(
  POW(position_x - :centerX, 2) + 
  POW(position_y - :centerY, 2) + 
  POW(position_z - :centerZ, 2)
)
LIMIT 100;
```

### Обновление позиции игрока

```sql
UPDATE players 
SET 
  position_x = :x,
  position_y = :y,
  position_z = :z,
  current_sector_id = :sector,
  last_login = NOW()
WHERE id = :player_id;
```

### Статистика игрока

```sql
-- Получить ресурсы игрока
SELECT 
  p.username,
  p.position_x, p.position_y, p.position_z,
  pr_metal.amount as metal,
  pr_silicon.amount as silicon,
  pr_ice.amount as ice,
  pr_rare.amount as rare
FROM players p
LEFT JOIN player_resources pr_metal 
  ON p.id = pr_metal.player_id AND pr_metal.resource_type = 'metal'
LEFT JOIN player_resources pr_silicon 
  ON p.id = pr_silicon.player_id AND pr_silicon.resource_type = 'silicon'
LEFT JOIN player_resources pr_ice 
  ON p.id = pr_ice.player_id AND pr_ice.resource_type = 'ice'
LEFT JOIN player_resources pr_rare 
  ON p.id = pr_rare.player_id AND pr_rare.resource_type = 'rare'
WHERE p.id = :player_id;
```

---

## 🛡️ Безопасность

### 1. Защита от SQL инъекций

**Используйте параметризованные запросы:**

```typescript
// ✅ Правильно (mysql2)
await pool.execute(
  `SELECT * FROM players WHERE username = ?`,
  [playerName]
);

// ❌ Неправильно
await pool.execute(
  `SELECT * FROM players WHERE username = '${playerName}'`
);
```

### 2. Валидация данных

```typescript
// Валидация имени игрока
function validatePlayerName(name: string): boolean {
  if (!name || name.length < 3 || name.length > 20) return false;
  return /^[a-zA-Zа-яА-ЯёЁ0-9_ ]+$/u.test(name);
}

// Валидация ресурса
function validateResourceType(type: string): boolean {
  return ['metal', 'silicon', 'ice', 'rare'].includes(type);
}
```

### 3. Ограничение прав пользователя

```sql
-- Только необходимые права
GRANT SELECT, INSERT, UPDATE ON cosmocraft.players TO 'cosmocraft_user'@'localhost';
GRANT SELECT, INSERT, UPDATE ON cosmocraft.player_resources TO 'cosmocraft_user'@'localhost';
GRANT SELECT ON cosmocraft.worlds TO 'cosmocraft_user'@'localhost';
GRANT SELECT ON cosmocraft.asteroids TO 'cosmocraft_user'@'localhost';

-- Не давать DROP, DELETE (если не требуется)
```

---

## 📈 Производительность

### Индексы для оптимизации

```sql
-- Для быстрого поиска астероидов в радиусе
CREATE INDEX idx_asteroids_position ON asteroids(position_x, position_y, position_z);
CREATE INDEX idx_asteroids_depleted ON asteroids(is_depleted);

-- Для поиска онлайн игроков
CREATE INDEX idx_players_online ON players(is_online);

-- Для поиска по сектору
CREATE INDEX idx_players_sector ON players(current_sector_id);
```

### Connection Pool

```typescript
// Оптимальные настройки пула
const pool = mysql.createPool({
  host: 'localhost',
  user: 'cosmocraft_user',
  password: 'password',
  database: 'cosmocraft',
  waitForConnections: true,
  connectionLimit: 10,  // Максимум соединений
  queueLimit: 0,        // Без ограничения очереди
  acquireTimeout: 60000,
  idleTimeout: 60000
});
```

---

## 🔧 Обслуживание

### Резервное копирование

```bash
# Полный бэкап БД
mysqldump -u root -p cosmocraft > cosmocraft_backup.sql

# Бэкап с gzip
mysqldump -u root -p cosmocraft | gzip > cosmocraft_backup.sql.gz

# Бэкап только структуры
mysqldump -u root -p --no-data cosmocraft > cosmocraft_structure.sql

# Бэкап только данные
mysqldump -u root -p --no-create-info cosmocraft > cosmocraft_data.sql
```

### Восстановление из бэкапа

```bash
# Восстановление БД
mysql -u root -p cosmocraft < cosmocraft_backup.sql

# Восстановление из gzip
gunzip < cosmocraft_backup.sql.gz | mysql -u root -p cosmocraft
```

### Очистка старых данных

```sql
-- Удалить истощённые астероиды (старше 30 дней)
DELETE FROM asteroids 
WHERE is_depleted = TRUE 
  AND depletion_time < DATE_SUB(NOW(), INTERVAL 30 DAY);

-- Удалить неактивных игроков (не заходили 90 дней)
DELETE FROM players 
WHERE last_login < DATE_SUB(NOW(), INTERVAL 90 DAY)
  AND is_online = FALSE;
```

### Анализ таблиц

```sql
-- Проверка таблиц на ошибки
CHECK TABLE players;
CHECK TABLE asteroids;
CHECK TABLE player_resources;

-- Оптимизация таблиц
OPTIMIZE TABLE players;
OPTIMIZE TABLE asteroids;
OPTIMIZE TABLE player_resources;

-- Анализ размера таблиц
SELECT 
  table_name,
  table_rows,
  ROUND((data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_schema = 'cosmocraft'
ORDER BY (data_length + index_length) DESC;
```

---

## 🐛 Отладка

### Просмотр данных

```sql
-- Все игроки
SELECT id, username, position_x, position_y, position_z, is_online 
FROM players;

-- Ресурсы игрока
SELECT pr.*, p.username 
FROM player_resources pr
JOIN players p ON pr.player_id = p.id
WHERE p.username = 'Gora';

-- Астероиды в радиусе 1000 от центра
SELECT type, position_x, position_y, position_z, 
       SQRT(POW(position_x, 2) + POW(position_y, 2) + POW(position_z, 2)) as distance
FROM asteroids
WHERE SQRT(POW(position_x, 2) + POW(position_y, 2) + POW(position_z, 2)) < 1000
ORDER BY distance
LIMIT 20;

-- Активный мир
SELECT * FROM worlds WHERE status = 'active';
```

### Логи MySQL

```bash
# Включение общего лога (для отладки)
SET GLOBAL general_log = 'ON';
SET GLOBAL general_log_file = '/var/log/mysql/mysql.log';

# Просмотр лога в реальном времени
tail -f /var/log/mysql/mysql.log

# Медленные запросы
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;  # Запросы медленнее 2 сек
```

---

## 📝 Миграции

### Создание миграции

```bash
# Скрипт миграции
node scripts/migrate-json-to-mysql.cjs
```

### Откат миграции

```sql
-- Очистка всех данных (ОСТОРОЖНО!)
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE players;
TRUNCATE TABLE player_resources;
TRUNCATE TABLE asteroids;
SET FOREIGN_KEY_CHECKS = 1;
```

---

## 🔗 Ссылки

- [MySQL Documentation](https://dev.mysql.com/doc/)
- [mysql2 npm package](https://www.npmjs.com/package/mysql2)
- [PLAYER_SYSTEM.md](./PLAYER_SYSTEM.md) - Система игроков
- [PLAYER_PROFILES.md](./PLAYER_PROFILES.md) - Профили игроков

---

**База данных - сердце CosmoCraft! Берегите её! 💾**
