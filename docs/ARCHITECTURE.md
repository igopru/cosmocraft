# 🏗️ Архитектура CosmoCraft

## Обзор

CosmoCraft — это космическая стратегия с видом от первого лица, где игрок управляет космическим кораблём в процедурно-генерируемом мире. Архитектура разделена на две независимые системы:

1. **Космос** — независимая система со своими законами (звёзды, астероиды, станции)
2. **Корабль** — локальная система координат игрока, перемещающаяся в космосе

---

## 🌌 Система космоса

### Назначение
Космос — это "живой организм", который существует и обновляется независимо от присутствия игрока. Все объекты космоса вращаются, анимируются и живут по своим законам.

### Компоненты

#### 1. Звезда (`VoxelStar.ts`)
**Расположение:** `src/client/VoxelStar.ts`

**Ответственность:**
- Визуализация центральной звезды (воксельная модель)
- Анимация ядра (мерцание)
- Анимация короны (пульсация)
- Вращение частиц

**Метод обновления:**
```typescript
public update(deltaTime: number) {
    // Анимация ядра (мерцание)
    this.core.children.forEach(child => {
        material.emissiveIntensity = baseIntensity * (0.8 + 0.2 * Math.sin(time * speed * phase));
    });

    // Анимация короны (пульсация)
    this.corona.children.forEach(child => {
        child.position.x = basePos.x + Math.sin(time * speed * phase) * 5;
        // ...
    });

    // Вращение частиц
    this.particles.rotation.y += 0.0002;
}
```

**Глобальные координаты:** Звезда находится в центре координат `(0, 0, 0)` и не перемещается.

---

#### 2. Астероиды (`Asteroid.ts`, `AsteroidField.ts`)
**Расположение:** `src/client/Asteroid.ts`, `src/client/AsteroidField.ts`

**Ответственность:**
- Генерация воксельных астероидов 4 типов (металлические, кремниевые, ледяные, редкие)
- Вращение каждого астероида вокруг своих осей
- Распределение по орбитам вокруг звезды

**Метод обновления:**
```typescript
// Asteroid.ts
public update() {
    this.mesh.rotation.x += this.rotationSpeed.x;
    this.mesh.rotation.y += this.rotationSpeed.y;
    this.mesh.rotation.z += this.rotationSpeed.z;
}

// AsteroidField.ts
public update() {
    this.asteroids.forEach(asteroid => asteroid.update());
}
```

**Глобальные координаты:** Каждый астероид имеет свою позицию в космосе и вращается независимо.

---

#### 3. Станции (`StationManager.ts`, `StationModule.ts`)
**Расположение:** `src/client/StationManager.ts`, `src/client/StationModule.ts`

**Ответственность:**
- Управление размещёнными станциями
- Конструктор станций (модульная сборка)
- Торговый интерфейс (StationShop)

**Глобальные координаты:** Станции размещаются в фиксированных позициях космоса.

---

### Цикл обновления космоса

В `main.ts` → `animate()`:

```typescript
private animate() {
    // 1. Обновление звезды (независимо от корабля)
    this.star.update(0.016);

    // 2. Обновление астероидов (независимо от корабля)
    if (this.asteroids) {
        this.asteroids.forEach(asteroid => {
            asteroid.rotation.x += speed.x;
            asteroid.rotation.y += speed.y;
            asteroid.rotation.z += speed.z;
        });
    }

    // 3. Обновление корабля (локальная система)
    this.shipController.update(delta);

    // 4. Рендеринг
    this.renderer.render(this.scene, this.camera);
}
```

---

## 🚀 Система корабля

### Назначение
Корабль — это локальная система координат игрока. Все движения и вращения корабля происходят относительно его собственной системы координат, но перемещение происходит в глобальных координатах космоса.

### Компоненты

#### `ShipController.ts`
**Расположение:** `src/client/ShipController.ts`

**Ответственность:**
- Обработка ввода (клавиатура, мышь)
- Физика движения (тяга, инерция, столкновения)
- Вращение корабля (yaw, pitch)
- Системы корабля (лазер, груз, спутники, щиты)

---

### Локальная система координат корабля

Корабль имеет собственную систему координат:

```
         Y (up)
         ↑
         |
         |
         O------→ X (right)
        /
       /
      ↓
    Z (forward)
```

**Локальные векторы:**
- `shipForward = (0, 0, -1)` — направление носа корабля
- `shipRight = (1, 0, 0)` — правый борт
- `shipUp = (0, 1, 0)` — верх корабля

Эти векторы применяются к кватерниону корабля для получения мировых направлений.

---

### Позиция и вращение

```typescript
// Позиция в глобальных координатах космоса
private shipPosition: THREE.Vector3 = new THREE.Vector3(500, 0, 0);

// Вращение (кватернион)
private shipQuaternion: THREE.Quaternion = new THREE.Quaternion();

// Скорость (вектор в глобальных координатах)
private velocity: THREE.Vector3;
```

---

### Управление

#### Вращение (выбор направления)

**Стрелки:**
- `←` / `→` — рыскание (yaw) вокруг **локальной оси Y** (вертикальная ось) — нос влево/вправо
- `↑` / `↓` — тангаж (pitch) вокруг **локальной оси X** (ось через крылья) — нос вверх/вниз

**Мышь:** Не используется для управления кораблём (свободна для интерфейса)

**Реализация вращения:**
```typescript
// 1. Определяем локальные оси из текущего кватерниона корабля
const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(this.ship.quaternion);
const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(this.ship.quaternion);

// ↑ / ↓ - тангаж (pitch) вокруг локальной оси X
if (this.keysPressed.has('ArrowUp')) {
    const q = new THREE.Quaternion().setFromAxisAngle(localX, rotationSpeed);
    this.ship.quaternion.premultiply(q);
}
if (this.keysPressed.has('ArrowDown')) {
    const q = new THREE.Quaternion().setFromAxisAngle(localX, -rotationSpeed);
    this.ship.quaternion.premultiply(q);
}

// ← / → - рыскание (yaw) вокруг локальной оси Y
if (this.keysPressed.has('ArrowLeft')) {
    const q = new THREE.Quaternion().setFromAxisAngle(localY, rotationSpeed);
    this.ship.quaternion.premultiply(q);
}
if (this.keysPressed.has('ArrowRight')) {
    const q = new THREE.Quaternion().setFromAxisAngle(localY, -rotationSpeed);
    this.ship.quaternion.premultiply(q);
}

// Нормализация (предотвращение дрейфа)
this.ship.quaternion.normalize();
```

**Важно:**
- **Сначала вычисляем локальные оси** через `applyQuaternion(this.ship.quaternion)`
- **`premultiply(q)`** — применяет вращение вокруг локальной оси в мировом пространстве
- **НЕ используем** `ship.rotateX/Y()` — могут давать инверсию на 90°
- **НЕ используем** `ship.rotation.x += ...` (Euler углы, Gimbal Lock)
- **Нормализуем кватернион** после каждого изменения

**Корабль крутится как волчок** — нет границ вращения, нет инверсии на 90°.

**Оси вращения корабля (Local Space):**
```
         Y (вертикальная ось)
         ↑
         │
         │
    Z ←──┼──→ X (ось через крылья)
  (нос)  │
         │
    (корма)
```

- **Ось X** — проходит через крылья слева направо. Вращение = тангаж (pitch), нос вверх/вниз
- **Ось Y** — вертикальная ось через крышу/дно. Вращение = рыскание (yaw), нос влево/вправо
- **Ось Z** — проходит через нос и корму. Вращение = крен (roll), не используется

**Важно:** 
- Корабль смотрит носом в **-Z** (стандарт Three.js)
- Камера — «ребёнок» корабля (`ship.add(camera)`), находится внутри и смотрит туда же
- Мы двигаем **ТОЛЬКО корабль**. Космос неподвижен
- Если корабль повернул нос вверх (`rotateX`), камера автоматически увидит звёзды «внизу», потому что она часть корабля

---

#### Тяга (движение)

**Клавиши:**
- `A` — увеличить тягу (+10%)
- `Z` — уменьшить тягу (-10%)
- `Backspace` — сброс скорости

**Принцип:**
- Корабль летит **туда, куда смотрит нос**
- Тяга задаёт скорость от 0% до 100% от максимальной

**Реализация:**
```typescript
// Вычисление текущей скорости
let currentMaxSpeed = this.maxSpeed;
if (this.turboMode) currentMaxSpeed *= 2;
if (this.setaMode) currentMaxSpeed *= 5;
if (this.setaBoost) currentMaxSpeed *= 10;

this.speed = (this.throttle / 100) * currentMaxSpeed;

// Движение в направлении носа
const moveDistance = this.speed * deltaTime;
this.shipPosition.add(this.shipForward.clone().multiplyScalar(moveDistance));
```

---

### Привязка камеры (FPV)

**Камера НЕ является дочерним объектом корабля** — копируем матрицу явно:

```typescript
// При инициализации - НЕ добавляем камеру к кораблю
// this.ship.add(this.camera);  // Закомментировано!

// Фиксируем "верх" камеры относительно корабля
this.camera.up.set(0, 0, 1);  // Локальная ось Z корабля = "верх" камеры
this.camera.matrixAutoUpdate = true;

// В update() явно копируем трансформацию
this.camera.position.copy(this.ship.position);
this.camera.quaternion.copy(this.ship.quaternion);
```

**Преимущества:**
- Камера **не пытается выровняться** по мировому горизонту
- Нет скачков на 180° при перевороте
- Камера «тупая» — просто зеркало корабля
- Нет `lookAt()`, нет авто-выравнивания

**Важно:** 
- Камера **не привязана к звезде** (0, 0, 0)!
- Камера **не вращается независимо** от корабля
- Игрок смотрит туда, куда смотрит нос корабля
- Космос вращается вокруг корабля при повороте

**Начальная позиция:** Корабль спавнится над звездой в (0, 500, 0) и смотрит вниз на звезду.

---

### Системы корабля

#### 1. Лазер (добыча ресурсов)
- Выстрел из центра экрана
- Создание частицы ресурса при попадании в астероид
- Тип ресурса зависит от типа астероида

#### 2. Грузовой отсек
- Люк (`O`) — открытие/закрытие
- Автоматический сбор частиц в радиусе 15 единиц при открытом люке

#### 3. Спутники
- Развёртывание (`K`) — стоит 50 металла
- Отзыв (`H`) — возврат 50% стоимости
- Визуализация — зелёные октаэдры на орбите вокруг корабля

#### 4. Щиты и столкновения
- При столкновении -10% щитов
- Сброс скорости до 0
- 1 секунда неуязвимости
- При щитах = 0 — респавн

---

## 🔄 Взаимодействие систем

### Космос ↔ Корабль

```
┌─────────────────────────────────────────────────────────┐
│                      КОСМОС                             │
│  - Звезда (0, 0, 0) — вращается, анимируется           │
│  - Астероиды — вращаются, на орбитах                   │
│  - Станции — статичные объекты                         │
│                                                         │
│  Глобальные координаты (world space)                   │
└─────────────────────────────────────────────────────────┘
                          ↕
                  Столкновения
                  Лазерная добыча
                  Посадка на станции
                          ↕
┌─────────────────────────────────────────────────────────┐
│                     КОРАБЛЬ                             │
│  - shipPosition — позиция в космосе                    │
│  - shipQuaternion — вращение                           │
│  - velocity — вектор скорости                          │
│                                                         │
│  Локальные координаты (local space)                    │
│  Камера привязана к кораблю (FPV)                      │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Структура файлов

```
src/client/
├── main.ts                 # Точка входа, игровой цикл
├── ShipController.ts       # Управление кораблём
├── Spaceship.ts            # (устаревший, не используется)
├── VoxelStar.ts            # Звезда
├── Asteroid.ts             # Астероид (воксельный)
├── AsteroidField.ts        # Поле астероидов
├── StationManager.ts       # Управление станциями
├── StationModule.ts        # Модули станций
├── StationShop.ts          # Торговый интерфейс
├── Star.ts                 # (альтернативная звезда)
└── networking/
    └── WebSocketClient.ts  # Сетевое взаимодействие
```

---

## 🎮 Игровой цикл

```
┌─────────────────────────────────────────────────────────┐
│                  animate() (60 FPS)                     │
├─────────────────────────────────────────────────────────┤
│  1. requestAnimationFrame(() => this.animate())        │
│                                                         │
│  2. Обновление космоса:                                │
│     - this.star.update(0.016)                          │
│     - asteroid.rotation += rotationSpeed               │
│                                                         │
│  3. Обновление корабля:                                │
│     - this.shipController.update(delta)                │
│       • Обработка ввода (клавиши, мышь)                │
│       • Вращение (стрелки/мышь)                        │
│       • Движение (тяга A/Z)                            │
│       • Проверка столкновений                          │
│       • Обновление позиции камеры                      │
│                                                         │
│  4. Обновление HUD:                                    │
│     - this.hud.update({...})                           │
│                                                         │
│  5. Рендеринг:                                         │
│     - this.renderer.render(this.scene, this.camera)    │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Конфигурация

### Параметры корабля (жестко заданы в ShipController)

```typescript
private maxSpeed: number = 100;        // Максимальная скорость (ед/с)
private throttle: number = 0;          // Текущая тяга (0-100%)
private acceleration: number = 50;     // Ускорение (ед/с²)
private mouseSensitivity: number = 0.002;
```

### Режимы

```typescript
private turboMode: boolean = false;    // x2 скорости (Tab)
private setaMode: boolean = false;     // x5 скорости (J)
private setaBoost: boolean = false;    // x10 скорости (Shift+J)
```

---

## 📊 Математика вращения

### Кватернионы

Кватернион используется для представления вращения корабля:

```typescript
// Инициализация (нет вращения)
this.shipQuaternion.identity(); // (w=1, x=0, y=0, z=0)

// Вращение от осей
const rotationQuaternion = new THREE.Quaternion();
rotationQuaternion.setFromAxisAngle(axis, angle);
this.shipQuaternion.multiply(rotationQuaternion);

// Нормализация (предотвращение дрейфа)
this.shipQuaternion.normalize();
```

### Euler → Quaternion

```typescript
// Порядок вращения YXZ (yaw → pitch → roll)
const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
const quaternion = new THREE.Quaternion();
quaternion.setFromEuler(euler);
```

### Вектор направления из кватерниона

```typescript
// Локальный вектор "вперёд" в мировых координатах
const forward = new THREE.Vector3(0, 0, -1);
forward.applyQuaternion(this.shipQuaternion);
forward.normalize();
```

---

## 🐛 Отладка

### Логирование позиции и скорости

```typescript
console.log('📍 Позиция:', this.shipPosition);
console.log('🚀 Скорость:', this.speed, 'м/с');
console.log('🧭 Тяга:', this.throttle, '%');
```

### Визуализация направления

Добавить в сцену:

```typescript
const helper = new THREE.ArrowHelper(
    this.shipForward,
    this.shipPosition,
    50,   // длина
    0xff0000  // цвет (красный)
);
this.scene.add(helper);
```

---

## 📝 История изменений

### v0.2.0 (Текущая)
- ✅ Восстановлена независимая система космоса
- ✅ Корабль имеет локальную систему координат
- ✅ Вращение от стрелок и мыши работает корректно
- ✅ Движение по направлению носа (тяга A/Z)
- ✅ Удалён конфликтующий `Spaceship.ts`

### v0.1.0
- ❌ Конфликт между `Spaceship.ts` и `ShipController.ts`
- ❌ Корабль висел в (0, 0, 0)
- ❌ Космос не обновлялся независимо

---

## 🔗 Ссылки

- [SHIP_CONTROLS.md](./SHIP_CONTROLS.md) — Управление кораблём
- [PILOTING.md](./PILOTING.md) — Полёт и магазин станций
- [FPV_MODE.md](./FPV_MODE.md) — Режим от первого лица
