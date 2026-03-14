# 🚀 Управление кораблём CosmoCraft

## Обзор

Система управления кораблём реализует **6DOF (шесть степеней свободы)** для полётов в космосе. Корабль вращается вокруг своих локальных осей, камера жёстко зафиксирована на корабле и не пытается выровняться по мировому горизонту.

---

## 🎮 Органы управления

### Вращение (Orientation)

| Клавиша | Действие | Ось вращения |
|---------|----------|--------------|
| `←` (ArrowLeft) | Рыскание влево (yaw left) | Локальная Y (вертикальная) |
| `→` (ArrowRight) | Рыскание вправо (yaw right) | Локальная Y (вертикальная) |
| `↑` (ArrowUp) | Тангаж вверх (pitch up) | Локальная X (через крылья) |
| `↓` (ArrowDown) | Тангаж вниз (pitch down) | Локальная X (через крылья) |

### Движение (Movement)

| Клавиша | Действие |
|---------|----------|
| `A` | Увеличить тягу (+10%) |
| `Z` | Уменьшить тягу (-10%) |
| `Backspace` | Сброс скорости (тяга = 0) |

### Системы корабля

| Клавиша | Действие |
|---------|----------|
| `Ctrl` (левая/правая) | Лазер (добыча ресурсов) |
| `O` | Открыть/закрыть грузовой люк |
| `K` | Развернуть спутник (50 металла) |
| `H` | Отозвать все спутники |
| `Tab` | Турбо режим (x2 скорости) |
| `J` | S.E.T.A (x5 скорости) |
| `Shift + J` | S.E.T.A Boost (x10 скорости) |

---

## 📐 Математика вращения

### Локальные оси корабля

```
         Y (вертикальная ось через крышу/дно)
         ↑
         │
         │
    Z ←──┼──→ X (ось через крылья)
  (нос)  │
         │
    (корма)
```

**Оси в локальном пространстве:**
- **Ось X** `(1, 0, 0)` — проходит через крылья слева направо
- **Ось Y** `(0, 1, 0)` — вертикальная ось через крышу и дно
- **Ось Z** `(0, 0, 1)` — проходит через нос и корму

**Важно:** Корабль смотрит носом в **-Z** (стандарт Three.js).

---

### Вычисление локальных осей

Перед вращением вычисляем **реальные** локальные оси в мировом пространстве:

```typescript
// Получаем текущий кватернион корабля
const shipQuat = this.ship.quaternion;

// Преобразуем базовые оси в локальные оси корабля
const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(shipQuat);
const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(shipQuat);
const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(shipQuat);
```

**Зачем:** После поворота корабля его локальные оси **не совпадают** с мировыми. Например, если корабль перевернулся на 90°, его локальная ось X будет смотреть вдоль мировой Z.

---

### Вращение вокруг локальных осей

```typescript
const rotationSpeed = 2.5 * deltaTime;

// ↑ / ↓ - тангаж (pitch) вокруг локальной оси X
if (this.keysPressed.has('ArrowUp')) {
    const q = new THREE.Quaternion()
        .setFromAxisAngle(localX, rotationSpeed);
    this.ship.quaternion.premultiply(q);
}
if (this.keysPressed.has('ArrowDown')) {
    const q = new THREE.Quaternion()
        .setFromAxisAngle(localX, -rotationSpeed);
    this.ship.quaternion.premultiply(q);
}

// ← / → - рыскание (yaw) вокруг локальной оси Y
if (this.keysPressed.has('ArrowLeft')) {
    const q = new THREE.Quaternion()
        .setFromAxisAngle(localY, rotationSpeed);
    this.ship.quaternion.premultiply(q);
}
if (this.keysPressed.has('ArrowRight')) {
    const q = new THREE.Quaternion()
        .setFromAxisAngle(localY, -rotationSpeed);
    this.ship.quaternion.premultiply(q);
}

// Нормализация (предотвращение дрейфа)
this.ship.quaternion.normalize();
```

**Почему `premultiply`:**
- `localX` и `localY` — это уже **мировые** векторы (полученные через `applyQuaternion`)
- `premultiply` применяет вращение **до** текущего кватерниона
- Это даёт вращение **вокруг** локальной оси в мировом пространстве

---

### Математическая формула

```
1. Локальная ось = Базовая ось × Кватернион_корабля
2. Кватернион_вращения = Quaternion(Локальная_ось, Угол)
3. Новый_кватернион = Кватернион_вращения × Кватернион_корабля
4. Нормализация: Новый_кватернион.normalize()
```

---

## 📷 Система камеры

### Архитектура

**Камера НЕ является дочерним объектом корабля!**

```typescript
// ❌ НЕПРАВИЛЬНО (вызывает авто-выравнивание):
this.ship.add(this.camera);

// ✅ ПРАВИЛЬНО (явное копирование):
this.camera.position.copy(this.ship.position);
this.camera.quaternion.copy(this.ship.quaternion);
```

**Почему:**
- При добавлении как дочерний объект, Three.js может вычислять `matrixWorld` с авто-выравниванием
- Это вызывает скачки на 180° при перевороте корабля
- Явное копирование делает камеру «тупой» — она просто зеркало корабля

---

### Инициализация камеры

```typescript
// Фиксируем "верх" камеры относительно корабля
this.camera.up.set(0, 0, 1);  // Локальная ось Z = "верх" камеры
this.camera.matrixAutoUpdate = true;

// НЕ добавляем камеру к кораблю
// this.ship.add(this.camera);  // Закомментировано!

// Устанавливаем начальную позицию
this.camera.position.copy(this.ship.position);
```

**Важно:**
- `camera.up.set(0, 0, 1)` — «верх» для камеры это направление от носа к корме (локальная Z)
- **НЕ** `(0, 1, 0)` — это мировой «верх», который вызывает выравнивание!

---

### Обновление камеры в update()

```typescript
// В конце update() явно копируем трансформацию корабля на камеру
this.camera.position.copy(this.ship.position);
this.camera.quaternion.copy(this.ship.quaternion);
```

**Результат:**
- Камера следует за кораблём 1:1
- Нет авто-выравнивания по мировому горизонту
- Нет скачков при перевороте на 180°

---

## ⚠️ Критические правила

### ⛔ ЗАПРЕЩЕНО в update() корабля

**НИКОГДА не добавляй в `update()` корабля код содержащий:**

```typescript
// ❌ КАТЕГОРИЧЕСКИ НЕЛЬЗЯ:
camera.lookAt(...);      // Вызывает скачки на 180°
ship.lookAt(...);        // Переписывает кватернион
camera.up.set(0, 1, 0);  // Авто-выравнивание по миру
ship.rotation.x += ...;  // Euler углы (Gimbal Lock)
ship.rotation.y += ...;  // Euler углы (ограничение 180°)
ship.rotateX(...);       // Может конфликтовать с локальными осями
ship.rotateY(...);       // Может давать инверсию
```

**Почему:**
- `lookAt()` пытается выровнять объект по мировой точке, ломая локальное вращение
- `rotation.x/y/z` используют углы Эйлера → Gimbal Lock на 90°
- `rotateX/Y()` могут работать нестабильно при сложных поворотах

---

### ✅ РАЗРЕШЕНО

```typescript
// ✅ МОЖНО:
// 1. Вычисление локальных осей
const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(this.ship.quaternion);
const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(this.ship.quaternion);

// 2. Вращение через кватернионы
const q = new THREE.Quaternion().setFromAxisAngle(localX, angle);
this.ship.quaternion.premultiply(q);

// 3. Нормализация
this.ship.quaternion.normalize();

// 4. Явное копирование камеры
this.camera.position.copy(this.ship.position);
this.camera.quaternion.copy(this.ship.quaternion);
```

---

### 🔧 Авто-выравнивание (кнопка «Горизонт»)

**Если захочешь добавить авто-выравнивание** (как кнопку «горизонт» в симуляторах), **делай это через плавную интерполяцию (slerp) кватернионов, а не через углы.**

**Пример реализации:**

```typescript
// Кнопка "горизонт" - выровнять корабль по мировому горизонту
if (this.keysPressed.has('KeyH')) {
    // Целевой кватернион (нос вперёд, крылья горизонтально)
    const targetQuaternion = new THREE.Quaternion();
    targetQuaternion.setFromEuler(new THREE.Euler(0, shipYaw, 0, 'YXZ'));
    
    // Плавная интерполяция (slerp)
    const alpha = 0.05;  // Скорость выравнивания (0.01-0.1)
    this.ship.quaternion.slerp(targetQuaternion, alpha);
    this.ship.quaternion.normalize();
}
```

**Почему `slerp`:**
- Плавный поворот без рывков
- Не ломает локальное вращение
- Работает через кватернионы (нет Gimbal Lock)

---

## 🔄 Полный цикл update()

```typescript
public update(deltaTime: number) {
    const rotationSpeed = 2.5 * deltaTime;

    // 1. Вычисляем локальные оси
    const localX = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(this.ship.quaternion);
    const localY = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(this.ship.quaternion);

    // 2. Вращение вокруг локальных осей
    if (this.keysPressed.has('ArrowUp')) {
        const q = new THREE.Quaternion()
            .setFromAxisAngle(localX, rotationSpeed);
        this.ship.quaternion.premultiply(q);
    }
    if (this.keysPressed.has('ArrowDown')) {
        const q = new THREE.Quaternion()
            .setFromAxisAngle(localX, -rotationSpeed);
        this.ship.quaternion.premultiply(q);
    }
    if (this.keysPressed.has('ArrowLeft')) {
        const q = new THREE.Quaternion()
            .setFromAxisAngle(localY, rotationSpeed);
        this.ship.quaternion.premultiply(q);
    }
    if (this.keysPressed.has('ArrowRight')) {
        const q = new THREE.Quaternion()
            .setFromAxisAngle(localY, -rotationSpeed);
        this.ship.quaternion.premultiply(q);
    }

    // 3. Нормализация кватерниона
    this.ship.quaternion.normalize();

    // 4. Обновление локальных векторов
    this.shipForward.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
    this.shipRight.set(1, 0, 0).applyQuaternion(this.ship.quaternion);
    this.shipUp.set(0, 1, 0).applyQuaternion(this.ship.quaternion);

    // 5. Движение (тяга)
    const moveDistance = this.speed * deltaTime;
    this.shipPosition.add(this.shipForward.clone().multiplyScalar(moveDistance));

    // 6. Обновление позиции корабля
    this.ship.position.copy(this.shipPosition);

    // 7. Проверка столкновений
    if (this.checkCollisions()) {
        this.handleCollision();
    }

    // 8. Лазер, частицы, спутники...
    if (this.laserFiring) this.fireLaser();
    this.updateResourceParticles(deltaTime);
    this.updateSatellites(deltaTime);

    // 9. Явное копирование трансформации на камеру
    this.camera.position.copy(this.ship.position);
    this.camera.quaternion.copy(this.ship.quaternion);

    // 10. Обновление HUD
    this.notifyStatusUpdate();
}
```

---

## 🐛 Отладка

### Логирование позиции и вращения

```typescript
console.log('📍 Позиция:', this.ship.position);
console.log('🧭 Кватернион:', this.ship.quaternion);
console.log('🚀 Скорость:', this.speed, 'м/с');
console.log('📊 Тяга:', this.throttle, '%');
```

### Визуализация локальных осей

```typescript
// Добавить в сцену для отладки
const axisHelper = new THREE.AxesHelper(50);
this.ship.add(axisHelper);

// Красная = X (крылья)
// Зелёная = Y (вертикальная)
// Синяя = Z (нос-корма)
```

### Проверка камеры

```typescript
// Убедиться что камера не имеет lookAt
console.log('Camera up:', this.camera.up);  // Должно быть (0, 0, 1)
console.log('Camera parent:', this.camera.parent);  // Должно быть null (не ship!)
```

---

## 📊 Характеристики

### Параметры вращения

| Параметр | Значение |
|----------|----------|
| Скорость вращения | `2.5 * deltaTime` (рад/с) |
| Метод вращения | `quaternion.premultiply(q)` |
| Нормализация | Каждый кадр после вращения |
| Оси | Локальные (вычисляются через `applyQuaternion`) |

### Параметры камеры

| Параметр | Значение |
|----------|----------|
| Позиция | Копируется из `ship.position` |
| Вращение | Копируется из `ship.quaternion` |
| Вектор "верх" | `(0, 0, 1)` (локальная Z корабля) |
| Дочерний объект | ❌ Нет (явное копирование) |
| `lookAt()` | ❌ Запрещено |
| `matrixAutoUpdate` | ✅ `true` |

---

## 📝 История изменений

### v0.3.0 (Текущая)
- ✅ Вращение через локальные оси (`applyQuaternion` + `premultiply`)
- ✅ Камера «тупая» — явное копирование матрицы
- ✅ Нет `lookAt()`, нет авто-выравнивания
- ✅ Нет скачков на 180°
- ✅ Бесконечное вращение без границ

### v0.2.0
- ❌ `rotateX/Y()` — давали инверсию на 90°
- ❌ Камера как дочерний объект — авто-выравнивание
- ❌ Скачки при перевороте

### v0.1.0
- ❌ Euler углы (`ship.rotation.x += ...`)
- ❌ Gimbal Lock на 90°
- ❌ Ограничение 180°

---

## 🔗 Ссылки

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Общая архитектура
- [SHIP_CONTROLS.md](./SHIP_CONTROLS.md) — Схема управления
- [PILOTING.md](./PILOTING.md) — Полёт и магазин станций

---

## 💡 Советы

1. **Держи тягу на минимуме** при маневрировании — легче контролировать повороты
2. **Используй турбо** только для прямолинейных перелётов
3. **Не паникуй при перевороте** — корабль не «сломался», просто мир перевернулся
4. **Тренируйся на звезде** — она в центре, удобно для отработки мёртвых петель
5. **Следи за HUD** — там показана текущая скорость и тяга

**Удачи в космосе, пилот! 🚀**
