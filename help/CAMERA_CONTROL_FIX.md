# Исправление управления камерой - Полный контроль пилота

## Дата исправления
2026-03-08

## Проблема

**До исправления:**
- ❌ Камера смотрела только на звезду (в центр сцены)
- ❌ Вращение было ограничено небольшим овалом
- ❌ Мышь и стрелки не управляли камерой полноценно
- ❌ Spaceship автоматически поворачивал камеру на звезду

## Причина

Класс `Spaceship` автоматически управлял камерой:
1. Копировал позицию и кватернион в `updatePhysics()`:
   ```typescript
   this.camera.position.copy(this.position);
   this.camera.quaternion.copy(this.quaternion);
   ```

2. Автоматически поворачивал корабль к цели в `handleFocus()`:
   ```typescript
   // Поворачиваемся к цели
   this.quaternion.multiply(deltaQuaternion);
   ```

3. Автоматически поворачивал к станции в `handleLanding()`:
   ```typescript
   // Поворот к станции
   this.quaternion.multiply(quaternion);
   ```

## Решение

### 1. Отключено обновление Spaceship

**Файл:** `src/client/main.ts`

```typescript
// Отключаем обновление корабля - он больше не управляет камерой!
/*
if (this.spaceship) {
    this.spaceship.update(delta);
}
*/
```

### 2. Отключён callback визуального обновления

**Файл:** `src/client/main.ts`

```typescript
// Отключаем callback - корабль не должен управлять камерой
if (this.spaceship) {
    this.spaceship.setVisualUpdateCallback(() => {});
}
```

### 3. Pointer Lock для управления мышью

**Файл:** `src/client/ShipController.ts`

```typescript
private enablePointerLock() {
    const canvas = this.renderer.domElement as HTMLCanvasElement;
    canvas.addEventListener('click', () => {
        canvas.requestPointerLock();
    });
}
```

### 4. Прямое управление камерой

**Файл:** `src/client/ShipController.ts`

```typescript
private onMouseMove(event: MouseEvent) {
    // Движение мыши напрямую вращает камеру
    this.cameraYaw -= event.movementX * this.mouseSensitivity;
    this.cameraPitch -= event.movementY * this.mouseSensitivity;
    
    // Ограничиваем вертикальный угол
    this.cameraPitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, this.cameraPitch));
    
    // Применяем вращение
    this.camera.rotation.set(this.cameraPitch, this.cameraYaw, this.cameraRoll, 'YXZ');
}
```

## Как использовать

### Запуск

1. Откройте http://localhost:8001/index.html
2. Войдите в игру
3. **Кликните по игровому полю** для захвата мыши

### Управление камерой

| Действие | Управление |
|----------|------------|
| **Оглядеться** | Мышь (после клика) |
| Вперёд/назад | `↑` / `↓` |
| Влево/вправо | `←` / `→` |
| Вверх/вниз | `PageUp` / `PageDown` |
| Огонь | `Ctrl` |

### Pointer Lock

- **Клик** → захват мыши (курсор исчезает)
- **ESC** → освобождение мыши

## Проверка работы

### 1. Консоль браузера

После клика:
```
🔒 Pointer Lock запрошен
🔒 Pointer Lock активен - мышь управляет камерой
```

### 2. Тест вращения

1. Кликните по канвасу
2. Двигайте мышь - камера должна вращаться на 360°
3. Нажмите стрелку вперёд - камера должна лететь в направлении взгляда

### 3. Проверка в консоли

```javascript
// Проверка направления камеры
window.game.camera.rotation
// Должно меняться при вращении мыши

// Проверка Pointer Lock
document.pointerLockElement // canvas или null
```

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `src/client/main.ts` | Отключено обновление Spaceship, отключён callback |
| `src/client/ShipController.ts` | Pointer Lock, прямое управление камерой |

## Технические детали

### Архитектура управления

**До:**
```
Spaceship → Camera (автоматический поворот на звезду)
```

**После:**
```
ShipController → Camera (прямое управление от пилота)
Spaceship (отключен, не влияет на камеру)
```

### Порядок вращения YXZ

```typescript
camera.rotation.order = 'YXZ';
```

Важно для FPS управления:
1. **Yaw (Y)** - вращение влево/вправо
2. **Pitch (X)** - вращение вверх/вниз
3. **Roll (Z)** - крен

### Чувствительность мыши

```typescript
mouseSensitivity = 0.002;
```

Можно настроить для более быстрого/медленного вращения.

## Отладка

### Консольные сообщения

```
🔒 Pointer Lock запрошен
🔒 Pointer Lock активен - мышь управляет камерой
🔓 Pointer Lock отключён
```

### Проверка в браузере

```javascript
// Доступ к контроллеру
window.game.shipController

// Текущее вращение
window.game.camera.rotation
// {x: 0.5, y: 1.2, z: 0, order: 'YXZ'}

// Принудительный поворот
window.game.camera.rotation.y += 0.1
```

## Примечания

1. **Корабль остаётся на сцене** - виден, но не управляет камерой
2. **Камера полностью отвязана** - пилот управляет напрямую
3. **Pointer Lock требует клика** - браузеры требуют взаимодействие пользователя
4. **ESC освобождает мышь** - стандартное поведение

## Планы развития

1. **Добавить корабль в вид от третьего лица** - переключение режимов
2. **Визуализация корабля в POV** - руки пилота, приборная панель
3. **Звуки управления** - сервоприводы, двигатели
4. **Инерция вращения** - плавное замедление
