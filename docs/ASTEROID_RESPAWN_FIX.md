# 🔧 Исправления астероидов и кнопки "Начать заново"

## Проблемы

1. **Пропали все астероиды после авторизации**
2. **Кнопка "Начать заново" при сгорании не работала**

## Решения

### 1. Кнопка "Начать заново"

**Было:**
```typescript
document.getElementById('restart-btn')?.addEventListener('click', () => {
    location.reload();  // Перезагружает страницу - возвращает к экрану входа!
});
```

**Стало:**
```typescript
document.getElementById('restart-btn')?.addEventListener('click', () => {
    console.log('🔄 Кнопка "Начать заново" нажата');
    
    // Удаляем меню
    mainMenuEl.remove();
    
    // Вызываем респавн
    this.respawn();
    
    console.log('✅ Респавн выполнен');
});
```

**Результат:** Кнопка теперь вызывает `respawn()` без перезагрузки страницы, сохраняя сессию авторизации.

### 2. Астероиды

**Проблема:** Астероиды запрашиваются через WebSocket, но после авторизации соединение может быть не установлено.

**Как работает:**
1. `CosmoCraftGame` создаёт `WebSocketClient` в конструкторе
2. При `start()` вызывается `requestAsteroids()`
3. `requestAsteroids()` отправляет `getAsteroids` через WebSocket
4. Сервер отвечает `asteroidsData`
5. `renderAsteroids()` отрисовывает астероиды

**Возможные причины отсутствия астероидов:**
- WebSocket не подключился к серверу
- Сервер не обрабатывает `getAsteroids` от клиента
- Данные не доходят до `renderAsteroids()`

**Проверка:**
```javascript
// В консоли браузера:
console.log('WebSocket connected:', window.game.wsClient.connected);
console.log('Asteroids count:', window.game.visibleAsteroids.size);
console.log('All asteroids data:', window.game.allAsteroidsData.length);
```

## Файлы

- `src/client/ShipController.ts` - исправлена кнопка respawn
- `src/client/main.ts` - запрос астероидов
