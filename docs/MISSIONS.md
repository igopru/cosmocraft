# 🎯 Система заданий (Миссии)

## Обзор

Система заданий позволяет пилотам выполнять викторины по космической тематике, получать награды и подниматься по рангам.

**Версия:** 0.5.0

---

## 📋 Структура задания

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | varchar(100) | Уникальный идентификатор (напр. `mission_day_cosmonautics`) |
| `title` | varchar(255) | Название задания |
| `description` | text | Описание/контекст |
| `category` | enum | `history`, `science`, `exploration` |
| `type` | enum | `quiz`, `flight`, `search`, `visit` |
| `difficulty` | enum | `easy`, `medium`, `hard` |
| `question` | text | Вопрос викторины |
| `options` | json | Массив вариантов ответа: `["A","B","C","D"]` |
| `correct_answer` | int | Индекс правильного ответа (0-3) |
| `reward_xp` | int | Награда опытом |
| `reward_fuel` | int | Награда топливом |
| `reward_metal` | int | Награда металлом |
| `reward_silicon` | int | Награда кремнием |
| `reward_ice` | int | Награда льдом |
| `reward_rare` | int | Награда редкими ресурсами |
| `is_repeatable` | tinyint | Можно ли выполнять повторно |
| `prerequisite_mission_id` | varchar(100) | ID предыдущего задания |

---

## 🏆 Ранги пилотов

| # | Ранг | XP | Описание |
|---|------|-----|----------|
| 1 | Новичок 🔰 | 0 | Начинающий пилот |
| 2 | Исследователь 🔭 | 50 | Начал изучать просторы космоса |
| 3 | Космонавт 🧑‍🚀 | 150 | Опытный путешественник |
| 4 | Пилот ✈️ | 300 | Уверенно управляет кораблём |
| 5 | Командир 👨‍✈️ | 500 | Ведёт за собой |
| 6 | Капитан ⭐ | 800 | Командир звёздного корабля |
| 7 | Ветеран 🎖️ | 1200 | Закалённый в боях |
| 8 | Легенда 👑 | 2000 | Легенда CosmoCraft |

---

## 🌐 API

### Получить все задания
```
GET /api/missions
Header: X-Player-Name: <имя пилота>
```
Возвращает список всех активных заданий с прогрессом пилота.

### Начать задание
```
POST /api/missions/:id/start
Header: X-Player-Name: <имя пилота>
```

### Отправить ответ
```
POST /api/missions/:id/answer
Header: X-Player-Name: <имя пилота>
Header: Content-Type: application/json
Body: { "answer": <индекс ответа 0-3> }
```

### Админ-маршруты
| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/admin/missions` | Все задания |
| `POST` | `/api/admin/missions` | Создать задание |
| `PUT` | `/api/admin/missions/:id` | Обновить задание |
| `DELETE` | `/api/admin/missions/:id` | Удалить задание |
| `GET` | `/api/admin/missions/stats` | Статистика заданий |
| `GET` | `/api/admin/missions/ranks` | Все ранги |

---

## 🛡️ Защита от дублирования

1. **Клиент**: после нажатия кнопки ответа все кнопки приглушаются, правильный ответ подсвечивается ✓, неправильный — ✗
2. **Сервер (`submitQuizAnswer`)**: проверяет `status == 'completed'` — блокирует ответ на выполненное задание
3. **Сервер (`completeMission`)**: двойная проверка перед выдачей наград — защита от race condition

---

## 🗄️ Таблицы БД

### `missions`
Основная таблица заданий.

### `pilot_ranks`
Таблица рангов (8 записей).

### `pilot_mission_progress`
Прогресс пилотов по заданиям:
- `player_id` — UUID игрока
- `mission_id` — ID задания
- `status` — `available`, `in_progress`, `completed`
- `progress` — JSON с деталями (выбранный ответ, правильность)
- `attempts_count` — количество попыток

### `mission_player_stats`
Общая статистика пилота:
- `total_xp` — суммарный опыт
- `missions_completed` — количество выполненных заданий
- `current_rank_id` — текущий ранг

---

## 🎮 Клиент (MissionUI)

Панель заданий открывается клавишей **Q**.

### Ключевые файлы
| Файл | Описание |
|------|----------|
| `src/ui/MissionUI.ts` | Компонент панели заданий |
| `src/client/ShipController.ts` | Обработчик клавиши Q, `setPlayerName()` |
| `src/client/main.ts` | Передача имени при WebSocket login |

### Поведение
1. При первом входе — prompt для ввода имени
2. После подключения WebSocket — отправка `playerLogin`
3. Получение `playerData` → сохранение имени → `setPlayerName()`
4. Нажатие Q → рендер заданий с фильтрами
5. Выбор ответа → отправка на сервер → подсветка результата → диалог

---

## 📝 Создание нового задания

Через админ-панель (`/admin` → Задания → + Создать):
1. Заполните название, описание, категорию, тип, сложность
2. Для викторины: вопрос + 4 варианта ответа + индекс правильного
3. Установите награды (XP, топливо, ресурсы)
4. Нажмите «Создать»

Или напрямую в БД:
```sql
INSERT INTO missions (id, title, description, category, type, difficulty,
  question, options, correct_answer, reward_xp, reward_fuel, reward_metal,
  is_active, is_repeatable, sort_order)
VALUES ('mission_my_mission', 'Моё задание', 'Описание', 'science', 'quiz', 'easy',
  'Вопрос?', '["A","B","C","D"]', 0, 50, 30, 10, 1, 0, 100);
```
