# Техническая документация: Система пилотирования CosmoCraft

## Обзор

Система пилотирования реализует управление космическим кораблём от первого лица (FPV) с физикой полёта, основанной на векторах направления и кватернионах для вращения.

## Архитектура

### Основные компоненты

```
┌─────────────────────────────────────────────────────────┐
│                    Spaceship.ts                          │
├─────────────────────────────────────────────────────────┤
│  - Физика движения (векторы)                            │
│  - Вращение (кватернионы + Euler)                       │
│  - Обработка ввода (клавиатура)                  │
│  - Визуализация (скрытая модель + GunHUD)              │
│  - Система фокусировки                                  │
│  - Автоматическая посадка                               │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    StationShop.ts                        │
├─────────────────────────────────────────────────────────┤
│  - Торговый интерфейс (X-Tension стиль)                 │
│  - Категории товаров                                    │
│  - Система корзины                                      │
└─────────────────────────────────────────────────────────┘
```

## Физика движения

### Вектор направления

```typescript
// Базовое направление камеры в Three.js
const forward = new THREE.Vector3(0, 0, -1);
forward.applyQuaternion(this.quaternion);
forward.normalize();
```

**Обоснование:**
- В Three.js камера по умолчанию смотрит по оси -Z
- Кватернион применяется для получения мирового направления
- Нормализация обеспечивает единичную длину вектора

### Ускорение и скорость

```typescript
// Ускорение от двигателей
acceleration.add(forward.clone().multiplyScalar(
    this.config.acceleration * delta
));

// Применение ускорения к скорости
this.velocity.add(acceleration);

// Ограничение максимальной скорости
if (speed > this.config.maxSpeed) {
    this.velocity.normalize().multiplyScalar(this.config.maxSpeed);
}

// Затухание (демпфирование)
this.velocity.multiplyScalar(this.config.damping);
```

**Физическая модель:**
1. **Ускорение** - постоянная сила двигателей
2. **Инерция** - скорость сохраняется между кадрами
3. **Демпфирование** - искусственное трение для управляемости
4. **Ограничение** - максимальная скорость

### Торможение (клавиша S)

```typescript
if (currentSpeed > 10) {
    // Режим торможения (усиленное противоускорение)
    const brakeForce = this.velocity
        .clone()
        .normalize()
        .multiplyScalar(-this.config.acceleration * 1.5 * delta);
    acceleration.add(brakeForce);
} else {
    // Режим заднего хода (ослабленное ускорение назад)
    acceleration.add(forward.clone().multiplyScalar(
        -this.config.acceleration * 0.5 * delta
    ));
}
```

**Логика:**
- При скорости > 10 ед./с - торможение с коэффициентом 1.5
- При скорости < 10 ед./с - движение назад с коэффициентом 0.5

## Вращение корабля

### Кватернионы и Euler

```typescript
// Инициализация
this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
this.quaternion = new THREE.Quaternion();

// Вращение от ввода
this.rotation.y += rotationSpeed * delta;  // Yaw (A/D)
this.rotation.x += rotationSpeed * delta;  // Pitch (↑/↓)

// Синхронизация
this.quaternion.setFromEuler(this.rotation);
```

**Порядок вращения YXZ:**
1. **Y (Yaw)** - поворот вокруг оси Y (влево/вправо)
2. **X (Pitch)** - поворот вокруг оси X (вверх/вниз)
3. **Z (Roll)** - крен (не используется в базовом управлении)

### Вращение от клавиш

```typescript
// A/D - Yaw (поворот носа влево/вправо)
if (this.keys['KeyA']) {
    this.rotation.y += this.config.rotationSpeed * delta;
}
if (this.keys['KeyD']) {
    this.rotation.y -= this.config.rotationSpeed * delta;
}

// Q/E - Pitch (тангаж вверх/вниз)
if (this.keys['KeyQ']) {
    this.rotation.x += this.config.rotationSpeed * delta;
}
if (this.keys['KeyE']) {
    this.rotation.x -= this.config.rotationSpeed * delta;
}
```

## Система фокусировки

### Установка цели

```typescript
private setFocusTarget() {
    // Направление взгляда
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(this.quaternion);
    direction.normalize();

    // Raycasting
    const raycaster = new THREE.Raycaster(
        this.camera.position,
        direction
    );

    const intersects = raycaster.intersectObjects(this.scene.children, true);

    if (intersects.length > 0) {
        // Цель найдена - точка пересечения
        this.focusTarget = intersects[0].point.clone();
    } else {
        // Цели нет - точка в направлении взгляда
        this.focusTarget = this.camera.position.clone()
            .add(direction.multiplyScalar(1000));
    }
}
```

### Автоматическое наведение

```typescript
private handleFocus(delta: number) {
    if (!this.isFocused || !this.focusTarget) return;

    // Вектор к цели
    const toTarget = new THREE.Vector3()
        .subVectors(this.focusTarget, this.position);
    toTarget.normalize();

    // Текущее направление
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.quaternion);
    forward.normalize();

    // Угол между направлениями
    const angle = forward.angleTo(toTarget);

    if (angle > 0.01) {
        const turnSpeed = this.config.rotationSpeed * delta * 2;

        // Ось вращения (перпендикуляр к обоим векторам)
        const axis = new THREE.Vector3()
            .crossVectors(forward, toTarget);

        if (axis.length() > 0.001) {
            axis.normalize();

            // Поворот через кватернион
            const deltaQuaternion = new THREE.Quaternion();
            deltaQuaternion.setFromAxisAngle(axis, Math.min(angle, turnSpeed));
            this.quaternion.multiply(deltaQuaternion);
            this.quaternion.normalize();

            // Обновление Euler
            this.rotation.setFromQuaternion(this.quaternion);
        }
    }
}
```

**Алгоритм:**
1. Вычисляется вектор от корабля к цели
2. Находится угол между текущим направлением и целью
3. Вычисляется ось вращения (векторное произведение)
4. Применяется поворот на минимальный угол (angle vs turnSpeed)
5. Кватернион нормализуется для избежания дрейфа

## Посадка на станцию

### Поиск ближайшей станции

```typescript
private findNearestStation() {
    let minDistance = Infinity;
    let nearest = null;

    for (const station of this.landingStations) {
        const distance = this.position.distanceTo(station.position);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = { ...station, distance };
        }
    }

    this.nearestStation = nearest;
}
```

### Автоматическая посадка

```typescript
private handleLanding(delta: number) {
    if (!this.isLanding || !this.nearestStation) return;

    const stationPos = this.nearestStation.position;
    const distance = this.position.distanceTo(stationPos);

    if (distance > 50) {
        // Движение к станции
        const toStation = new THREE.Vector3()
            .subVectors(stationPos, this.position);
        toStation.normalize();

        const landingSpeed = 20 * delta;
        this.position.add(toStation.multiplyScalar(landingSpeed));

        // Поворот к станции
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(this.quaternion);

        const angle = forward.angleTo(toStation);
        if (angle > 0.01) {
            const axis = new THREE.Vector3()
                .crossVectors(forward, toStation);
            axis.normalize();

            const quaternion = new THREE.Quaternion();
            quaternion.setFromAxisAngle(axis, 
                Math.min(angle, this.config.rotationSpeed * delta));
            this.quaternion.multiply(quaternion);
            this.rotation.setFromQuaternion(this.quaternion);
        }
    } else {
        // Посадка выполнена
        this.isLanding = false;
        this.nearestStation = null;
        this.velocity.set(0, 0, 0);
    }
}
```

## Конфигурация

### Параметры в .pilotenv

```ini
# Максимальная скорость (единиц/сек)
MAX_SPEED=800

# Ускорение двигателей (единиц/сек²)
ACCELERATION=200

# Скорость вращения (радиан/сек)
ROTATION_SPEED=3.0

# Затухание скорости (0.0-1.0)
DAMPING=0.95
```

### Применение конфигурации

```typescript
const config: SpaceshipConfig = {
    maxSpeed: parseFloat(process.env.MAX_SPEED) || 800,
    acceleration: parseFloat(process.env.ACCELERATION) || 200,
    rotationSpeed: parseFloat(process.env.ROTATION_SPEED) || 3.0,
    damping: parseFloat(process.env.DAMPING) || 0.95
};
```

## Обработка ввода

### Цикл обновления

```
┌─────────────────────────────────────────────────────────┐
│                  updatePhysics(delta)                    │
├─────────────────────────────────────────────────────────┤
│  1. handleInput(delta)     - обработка клавиш           │
│  2. handleStabilization()  - стабилизация вращения      │
│  3. handleLanding(delta)   - автоматическая посадка     │
│  4. Ограничение скорости                               │
│  5. Затухание скорости                                 │
│  6. Обновление позиции                                 │
│  7. Синхронизация камеры                               │
└─────────────────────────────────────────────────────────┘
```

### Приоритет ввода

1. **Посадка** (клавиша `) - высший приоритет
2. **Стабилизация** (ПКМ) - затухание вращения
3. **Ручное управление** (клавиши)

## Визуализация

### Скрытие модели корабля

```typescript
if (this.config.hideShip) {
    this.mesh.visible = false;
}
```

**Обоснование:**
- Улучшает обзор в FPV режиме
- Снижает визуальный шум
- Повышает производительность

### GunHUD (ориентиры орудий)

```typescript
private createGunHUD() {
    // Левый ориентир
    this.gunHUDLeft = document.createElement('div');
    this.gunHUDLeft.style.cssText = `
        position: fixed;
        left: 20px;
        bottom: 20px;
        width: 150px;
        height: 100px;
        background: linear-gradient(...);
        border: 2px solid rgba(0, 150, 255, 0.5);
    `;

    // Правый ориентир (зеркальный)
    this.gunHUDRight = document.createElement('div');
    // ... аналогично
}
```

**Назначение:**
- Визуальная ориентация в пространстве
- Ощущение габаритов корабля
- Декоративный элемент интерфейса

## Производительность

### Оптимизации

1. **Клонирование векторов**
   ```typescript
   // Правильно: создаёт новый вектор
   forward.clone().multiplyScalar(value)
   
   // Неправильно: модифицирует исходный
   forward.multiplyScalar(value)
   ```

2. **Нормализация кватерниона**
   ```typescript
   // Предотвращает накопление ошибок
   this.quaternion.normalize();
   ```

3. **Ранний выход**
   ```typescript
   if (!this.isFocused || !this.focusTarget) return;
   ```

4. **Ограничение количества проверок**
   ```typescript
   if (axis.length() > 0.001) {
       // Только если ось не нулевая
   }
   ```

## Отладка

### Логирование

```typescript
console.log('🎯 Фокусировка на точке:', this.focusTarget);
console.log('🚀 Скорость:', this.velocity.length().toFixed(1));
console.log('📍 Позиция:', this.position);
```

### Визуальная отладка

Добавить отображение векторов:
```typescript
// Визуализация направления
const helper = new THREE.ArrowHelper(
    forward,
    this.position,
    50,  // длина
    0xff0000  // цвет
);
this.scene.add(helper);
```

## Расширение

### Добавление новых органов управления

1. Добавить обработку клавиши в `onKeyDown/onKeyUp`
2. Добавить логику в `handleInput`
3. Обновить документацию

### Пример: добавление форсажа

```typescript
// В onKeyDown
if (key === 'ShiftLeft') {
    this.isAfterburner = true;
}

// В handleInput
const currentAccel = this.isAfterburner 
    ? this.config.acceleration * 2 
    : this.config.acceleration;
```

## Ссылки

- [Three.js Quaternion Documentation](https://threejs.org/docs/#api/en/math/Quaternion)
- [Three.js Vector3 Documentation](https://threejs.org/docs/#api/en/math/Vector3)
- [Three.js Euler Documentation](https://threejs.org/docs/#api/en/math/Euler)
