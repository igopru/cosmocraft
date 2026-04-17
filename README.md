# 🌌 CosmoCraft - Космическая стратегия

![CosmoCraft](https://img.shields.io/badge/version-0.6.1-blue)
![Node.js](https://img.shields.io/badge/Node.js-22-green)
![Three.js](https://img.shields.io/badge/Three.js-r183-orange)
![MySQL](https://img.shields.io/badge/MySQL-8.0-blue)
![Express](https://img.shields.io/badge/Express-5-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🎮 Об игре

**CosmoCraft** — многопользовательская космическая стратегия с воксельной графикой.
Исследуйте процедурно-генерируемые миры, добывайте ресурсы, стройте станции,
выполняйте задания и поднимайтесь по рангам пилотов.

### ✨ Особенности

- **Процедурная генерация** миров на основе модели Лотки-Вольтерры
- **Процедурная генерация** положений астероидов (клеточный автомат)
- **Воксельная графика** в стиле Minecraft в космосе
- **Экосистема ресурсов** — металл, кремний, лёд, редкие элементы
- **Многопользовательский режим** через WebSocket
- **Система престижа** — каждый новый мир сложнее предыдущего
- **Система заданий** — 15 викторин по космической тематике
- **Ранги пилотов** — 8 уровней от Новичка до Легенды
- **Админ-панель** — управление игроками, заданиями, безопасность
- **MySQL 8.0** для хранения данных

---

## 🔐 Важное уведомление о безопасности

> **ВНИМАНИЕ:** Система авторизации (регистрация, вход, восстановление пароля) **исключена из репозитория** и не распространяется вместе с проектом.
> 
> Каждый разработчик обязан самостоятельно реализовать или настроить систему аутентификации.
> 
> Подробности см. в документе [SECURITY_NOTICE.md](./SECURITY_NOTICE.md)

---

## 🚀 Быстрый старт

### Предварительные требования

- Node.js 18+
- MySQL 8.0+
- Python 3 (для клиента)

### Установка

```bash
# Клонируем репозиторий
git clone https://github.com/ваш-username/cosmocraft.git
cd cosmocraft

# Устанавливаем зависимости
npm install

# Создаём файл с переменными окружения
cp .env.example .env
# Отредактируйте .env, укажите пароль от БД

# Инициализируем базу данных
npm run db:init

# Компилируем проект
npm run build
```

### Запуск

**Терминал 1 - сервер:**
```bash
npm run dev
```

**Терминал 2 - клиент:**
```bash
cd public
python3 -m http.server 8001
```

**Откройте браузер:** http://localhost:8001

---

## 🎯 Геймплей

- **👤 Игрок** - исследует космос, добывает ресурсы
- **☄️ Астероиды** - 4 типа с разными ресурсами
- **🏗️ Строительство** - модульные станции
- **🌟 Звезда** - опасная зона, радиация
- **🌍 Миры** - процедурная генерация, престиж

---

## 🏗️ Архитектура

```
cosmocraft/
├── src/                       # Исходный код (TypeScript)
│   ├── client/                # Клиентская часть (Three.js)
│   │   ├── main.ts            # Точка входа, игровой цикл
│   │   ├── ShipController.ts  # Управление кораблём, HUD, пауза
│   │   └── networking/        # WebSocket клиент
│   ├── server/                # Серверная часть (Express 5 + WS)
│   │   ├── GameServer.ts      # Основной сервер
│   │   ├── services/          # Бизнес-логика
│   │   │   ├── AdminService.ts    # Админ-панель
│   │   │   └── MissionService.ts  # Система заданий
│   │   ├── routes/            # API маршруты
│   │   │   ├── admin.routes.ts    # Админ API
│   │   │   └── mission.routes.ts  # Задания API
│   │   └── storage/           # Работа с БД
│   ├── world/                 # Генерация миров
│   ├── ui/                    # UI компоненты
│   │   └── MissionUI.ts       # Панель заданий
│   └── config/                # Конфигурация
├── public/                    # Статические файлы (браузер)
│   ├── admin/                 # Админ-панель (SPA)
│   └── dist/                  # Скомпилированный клиент
├── scripts/database/          # SQL скрипты
│   ├── admin-schema.sql       # Схема админ-панели
│   ├── admin-fix-views.sql    # Исправления VIEW
│   └── missions-schema.sql   # Схема заданий
├── docs/                      # Документация
└── dist/                      # Скомпилированный сервер
```

### Порты

| Порт | Протокол | Назначение |
|------|----------|------------|
| 8080 | WebSocket | Игровой сервер (позиции, астероиды, чат) |
| 8001 | HTTP/Express | Статические файлы, API, админ-панель |

---

## 📊 Модель Лотки-Вольтерры

Распределение ресурсов в игре основано на классической модели "хищник-жертва":

- **Металл** - жертва (обильный ресурс)
- **Кремний** - промежуточный вид
- **Лёд** - вторичный ресурс
- **Редкие** - хищник (редкий ценный ресурс)

---

## 🔧 Команды

### Основные

```bash
npm run build        # Компиляция TypeScript (server + client)
npm run start        # Запуск продакшен сервера
./cosmocraft.sh start    # Запуск через сервис-скрипт
./cosmocraft.sh restart  # Перезапуск
./cosmocraft.sh stop     # Остановка
./cosmocraft.sh status   # Статус сервера
```

### Разработка

```bash
npm run dev          # Сервер с nodemon (авто-перезапуск)
npm run watch:server # Watch-режим сервера
npm run watch:client # Watch-режим клиента
```

### База данных

```bash
npm run db:init      # Инициализация БД (создание таблиц)
npm run db:backup    # Создание бэкапа БД
npm run db:restore   # Восстановление из бэкапа
npm run migrate      # Миграция данных
```

### Бэкап

```bash
./backup_db.sh       # Бэкап БД + файлов
```

---

## 📚 Документация

| Файл | Описание |
|------|----------|
| [CHANGELOG.md](./CHANGELOG.md) | 📋 История изменений по версиям |
| [SECURITY_NOTICE.md](./SECURITY_NOTICE.md) | 🔒 **ВАЖНО:** Ограничение распространения кода авторизации |
| [SETUP_SECURITY.md](./SETUP_SECURITY.md) | 🔐 **Настройка:** админ-панель, SMTP, БД, запуск сервера |
| [docs/MISSIONS.md](./docs/MISSIONS.md) | 🎯 **Система заданий:** викторины, ранги, награды, API |
| [docs/ADMIN_PANEL.md](./docs/ADMIN_PANEL.md) | 🛡️ **Админ-панель:** обзор, игроки, безопасность, журнал |
| [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md) | 🔐 **Система авторизации**: JWT, bcrypt, email, IP whitelist |
| [docs/SECURITY_GUIDE.md](./docs/SECURITY_GUIDE.md) | 🛡️ **Безопасность сервера**: firewall, HTTPS, fail2ban, бэкапы |
| [docs/DATABASE.md](./docs/DATABASE.md) | 🗄️ База данных MySQL, схема, запросы |
| [docs/PLAYER_SYSTEM.md](./docs/PLAYER_SYSTEM.md) | 👤 Система игроков, профили, безопасность |
| [docs/SHIP_CONTROLS.md](./docs/SHIP_CONTROLS.md) | 🚀 Управление кораблём, клавиши |
| [docs/PAUSE_MENU.md](./docs/PAUSE_MENU.md) | ⏸️ Пауза меню, информация |
| [docs/ENERGY_SYSTEM.md](./docs/ENERGY_SYSTEM.md) | ⚡ Энергия и ресурсы |
| [docs/STATION_ECONOMY.md](./docs/STATION_ECONOMY.md) | 🏪 Экономика станции |
| [docs/PILOTING.md](./docs/PILOTING.md) | 🎮 Система пилотирования |

---

## 🗄️ База данных

### Быстрая настройка БД

```bash
# Вход в MySQL
mysql -u root -p

# Создание БД и пользователя
CREATE DATABASE cosmocraft DEFAULT CHARACTER SET utf8mb4;
CREATE USER 'cosmocraft_user'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON cosmocraft.* TO 'cosmocraft_user'@'localhost';
FLUSH PRIVILEGES;

# Или используйте скрипт
npm run db:init
```

### Структура БД

**Основные таблицы:**
- `players` - игроки (UUID, имя, позиция, ресурсы)
- `player_resources` - ресурсы игроков (металл, кремний, лёд, редкие)
- `worlds` - миры (seed, номер, статус)
- `asteroids` - астероиды (тип, позиция, ресурсы)
- `stations` - станции

Подробности: [docs/DATABASE.md](./docs/DATABASE.md)

---

## 🔐 Безопасность

### Имя игрока
- Длина: 3-20 символов
- Разрешены: буквы (кириллица/латиница), цифры, пробелы, подчёркивания
- Запрещены: специальные символы

### Имя станции/корабля
- Длина: 3-30 символов
- Только: латиница, цифры, подчёркивания

### Обфускация
- HMAC-SHA256 для имён игроков
- UUID-индексы для папок
- Защита от SQL инъекций

---

## 🤝 Участие в разработке

1. Форкните репозиторий
2. Создайте ветку (`git checkout -b feature/amazing`)
3. Закоммитьте изменения (`git commit -m 'Add amazing feature'`)
4. Запушьте (`git push origin feature/amazing`)
5. Откройте Pull Request

---

## 📜 Лицензия

MIT

---

## 🙏 Благодарности

- **Джон Конвей** - за игру "Жизнь"
- **Мартин Гарднер** - за популяризацию математики
- **Лотка и Вольтерра** - за модель экосистем
- **Всем контрибьюторам**

---

## ⭐ Если проект понравился

Поставьте звезду на GitHub!

---

**Строй станции, копи ресурсы, захватывай космос! 🚀**
