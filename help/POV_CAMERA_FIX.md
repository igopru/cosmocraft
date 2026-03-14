# Исправление POV камеры - Вид от первого лица

## Дата исправления
2026-03-08

## Проблема

**До исправления:**
- ❌ Камера смотрела в центр сцены (на звезду) независимо от действий игрока
- ❌ Мышь не управляла камерой
- ❌ Стрелки не поворачивали камеру
- ❌ При выходе из FPV камера сбрасывалась на `lookAt(0,0,0)`

## Решение

### 1. Отключён `lookAt(0,0,0)`

**Файл:** `src/client/main.ts`

Убран вызов `camera.lookAt(0, 0, 0)` из `disableFPVMode()`:

```typescript
// Было:
this.camera.lookAt(0, 0, 0);

// Стало:
// Убрали: camera больше не смотрит на звезду принудительно
```

### 2. Pointer Lock API для управления мышью

**Файл:** `src/client/ShipController.ts`

Добавлен Pointer Lock для захвата мыши:

```typescript
private enablePointerLock() {
    const canvas = this.renderer.domElement as HTMLCanvasElement;
    canvas.addEventListener('click', () => {
        canvas.requestPointerLock();
    });
    
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === canvas) {
            console.log('🔒 Pointer Lock активен - мышь управляет камерой');
        }
    });
}
```

### 3. Инициализация направления камеры

**Файл:** `src/client/ShipController.ts`

Камера инициализируется с правильным направлением:

```typescript
// Устанавливаем начальное направление камеры (смотрит вперёд!)
this.camera.rotation.set(0, 0, 0, 'YXZ');
```

### 4. OrbitControls отключён

**Файл:** `src/client/main.ts`

```typescript
this.controls.enabled = false; // Отключаем сразу для POV режима
```

## Как использовать

### Запуск игры

1. Откройте http://localhost:8001/index.html
2. Войдите в игру
3. **Кликните по игровому полю** для захвата мыши (Pointer Lock)

### Управление камерой

| Действие | Управление |
|----------|------------|
| **Оглядеться** | Движение мыши (после клика) |
| Вперёд/назад | `↑` / `↓` |
| Влево/вправо | `←` / `→` |
| Вверх/вниз | `PageUp` / `PageDown` |
| Огонь | `Ctrl` |

### Pointer Lock

- **Клик** по игровому полю → захват мыши (курсор исчезает)
- **ESC** → освобождение мыши (курсор появляется)

## Проверка работы

Откройте консоль браузера (F12) и проверьте сообщения:

```
🔒 Pointer Lock запрошен
🔒 Pointer Lock активен - мышь управляет камерой
```

После клика по канвасу:
- Движение мыши должно вращать камеру
- Стрелки должны двигать камеру в направлении взгляда

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `src/client/main.ts` | Отключён `lookAt(0,0,0)`, отключён OrbitControls |
| `src/client/ShipController.ts` | Добавлен Pointer Lock, инициализация rotation |

## Технические детали

### Pointer Lock API

Pointer Lock захватывает мышь и скрывает курсор. Движение мыши передаётся через `event.movementX` и `event.movementY`:

```typescript
private onMouseMove(event: MouseEvent) {
    this.cameraYaw -= event.movementX * this.mouseSensitivity;
    this.cameraPitch -= event.movementY * this.mouseSensitivity;
    // ...
}
```

### Вращение камеры

Порядок вращения `YXZ` важен для FPS управления:

```typescript
camera.rotation.order = 'YXZ';
camera.rotation.set(pitch, yaw, roll, 'YXZ');
```

- **Yaw (Y)** - вращение вокруг вертикальной оси (влево/вправо)
- **Pitch (X)** - вращение вокруг горизонтальной оси (вверх/вниз)
- **Roll (Z)** - крен (не используется)

## Отладка

### Консоль браузера

```javascript
// Проверка направления камеры
window.game.camera.rotation
// {x: 0, y: 0, z: 0, order: 'YXZ'}

// Проверка Pointer Lock
document.pointerLockElement // null или canvas
```

### Логирование

В ShipController добавлено логирование:
- `🔒 Pointer Lock запрошен`
- `🔒 Pointer Lock активен`
- `🔓 Pointer Lock отключён`

## Примечания

1. **Pointer Lock работает только после взаимодействия** - нужен клик пользователя
2. **ESC освобождает мышь** - стандартное поведение браузера
3. **Камера не сбрасывается** - направление сохраняется между сессиями
