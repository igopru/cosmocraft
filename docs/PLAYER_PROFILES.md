# 👤 Система профилей игроков CosmoCraft

## Обзор

Каждый игрок имеет **индивидуальный профиль** с персональными настройками, статистикой и сохранениями. Профили хранятся в папке `players/{имя_игрока}/`.

---

## 📁 Структура профиля

```
players/
└── {playerName}/
    ├── resources.env      # Персональные настройки ресурсов
    ├── stats.json         # Статистика игрока
    └── saves.json         # Сохранения игр
```

### resources.env

Персональные коэффициенты ресурсов:
- Энергия, вода, расход
- Настройки лазера, двигателей
- Баланс игры

**Пример:**
```ini
ENERGY_CAPACITY=1000
ENERGY_START=500
WATER_TANK_CAPACITY=100
WATER_TANK_START=100
LASER_ENERGY_COST=1
ENGINE_ENERGY_COST=10
```

### stats.json

Статистика игрока:
```json
{
  "gamesPlayed": 10,
  "gamesWon": 0,
  "gamesLost": 10,
  "totalResourcesMined": 1500,
  "deathByStar": 5,
  "deathByAsteroid": 5,
  "bestRun": {
    "metal": 150,
    "silicon": 80,
    "ice": 120,
    "rare": 25
  }
}
```

### saves.json

Список сохранений:
```json
[
  {
    "timestamp": 1234567890,
    "position": { "x": 500, "y": 0, "z": 0 },
    "cargo": { "metal": 100, ... },
    ...
  }
]
```

---

## 🔧 Менеджер профилей

### scripts/player-profile-manager.cjs

**Функции:**

```javascript
// Загрузка профиля
loadPlayerProfile(playerName)

// Создание профиля
createPlayerProfile(playerName)

// Сохранение статистики
savePlayerStats(playerName, stats)

// Сохранение игры
saveGame(playerName, saveData)

// Обновление статистики при смерти
updateStatsOnDeath(playerName, deathStats)

// Список всех игроков
listAllPlayers()
```

---

## 🎮 Использование

### При старте игры

```typescript
// Загрузка профиля игрока
const playerName = localStorage.getItem('playerName') || 'Player1';
const profile = loadPlayerProfile(playerName);

// Применение настроек
const resourcesConfig = profile.resources;
ENERGY_CAPACITY = parseInt(resourcesConfig.ENERGY_CAPACITY);
WATER_TANK_START = parseInt(resourcesConfig.WATER_TANK_START);
```

### При смерти

```typescript
// Статистика смерти
const deathStats = {
    cause: 'star',  // или 'asteroid'
    cargo: {
        metal: this.cargo.metal,
        silicon: this.cargo.silicon,
        ice: this.cargo.ice,
        rare: this.cargo.rare
    }
};

// Обновление статистики
updateStatsOnDeath(playerName, deathStats);
```

### При сохранении

```typescript
const saveData = {
    position: this.shipPosition,
    cargo: this.cargo,
    energy: this.energy,
    water: this.water
};

saveGame(playerName, saveData);
```

---

## 📊 Статистика

### Отслеживаемые метрики

| Метрика | Описание |
|---------|----------|
| `gamesPlayed` | Всего игр |
| `gamesWon` | Побед (пока 0) |
| `gamesLost` | Поражений |
| `totalResourcesMined` | Всего добыто ресурсов |
| `deathByStar` | Сгорел в звезде |
| `deathByAsteroid` | Разбился об астероид |
| `bestRun` | Лучший результат по ресурсам |

### Рекорды

Автоматически сохраняется **лучший полёт** по сумме ресурсов:
```typescript
const totalResources = metal + silicon + ice + rare;
if (totalResources > previousBest) {
    stats.bestRun = currentCargo;
}
```

---

## 🎯 Примеры

### Новый игрок

```javascript
const profile = loadPlayerProfile('NewPlayer');
// Автоматически создаётся профиль:
// - players/NewPlayer/resources.env (копия базового)
// - players/NewPlayer/stats.json (нулевая статистика)
// - players/NewPlayer/saves.json (пусто)
```

### Загрузка существующего

```javascript
const profile = loadPlayerProfile('ExperiencedMiner');
console.log(profile.stats.gamesPlayed);  // 15
console.log(profile.stats.bestRun);      // { metal: 500, ... }
```

### Обновление после смерти

```javascript
updateStatsOnDeath('Player1', {
    cause: 'star',
    cargo: { metal: 150, silicon: 80, ice: 120, rare: 25 }
});
// gamesPlayed++
// gamesLost++
// deathByStar++
// totalResourcesMined += 375
```

---

## 📝 Интеграция с сервером

### API эндпоинты

```typescript
// Загрузка профиля
GET /api/player/:name/profile

// Сохранение игры
POST /api/player/:name/save
Body: { saveData }

// Статистика
GET /api/player/:name/stats
```

### Серверная часть

```javascript
// server/player-routes.js
app.get('/api/player/:name/profile', (req, res) => {
    const profile = loadPlayerProfile(req.params.name);
    res.json(profile);
});

app.post('/api/player/:name/save', (req, res) => {
    saveGame(req.params.name, req.body.saveData);
    res.json({ success: true });
});
```

---

## 🔐 Безопасность

### Валидация имени

```javascript
function validatePlayerName(name) {
    const valid = /^[a-zA-Z0-9_-]{3,20}$/.test(name);
    if (!valid) {
        throw new Error('Неверное имя игрока');
    }
    return valid;
}
```

### Ограничения

- Имя: 3-20 символов
- Только латиница, цифры, `_`, `-`
- Путь к профилю: `players/{name}/` (защита от `../`)

---

## 🐛 Отладка

### Логирование

```javascript
console.log('📁 Загрузка профиля:', playerName);
console.log('📊 Статистика:', profile.stats);
console.log('💾 Сохранения:', profile.saves.length);
```

### Проверка файлов

```bash
# Список игроков
ls players/

# Просмотр статистики
cat players/Player1/stats.json

# Ресурсы
cat players/Player1/resources.env
```

---

## 📈 Расширение

### Будущие возможности

1. **Ранги игроков** - по сумме ресурсов
2. **Достижения** - "Первый полёт", "Добытчик" и т.д.
3. **Таблица лидеров** - лучшие игроки
4. **История полётов** - все сохранения
5. **Экспорт/импорт** - резервное копирование

### Кастомизация

```javascript
// Персональные настройки для игрока
const playerConfig = {
    difficulty: 'normal',  // easy, normal, hard
    startingResources: 'standard',  // minimal, standard, generous
    starDanger: true  // опасная звезда или нет
};
```

---

## 🔗 Ссылки

- [ENERGY_SYSTEM.md](./ENERGY_SYSTEM.md) - Система энергии
- [resources.env](../config/resources.env) - Базовый конфиг
- [player-profile-manager.cjs](../scripts/player-profile-manager.cjs) - Менеджер профилей

**Каждый игрок уникален! Сохраняй прогресс в своём профиле! 🎮**
