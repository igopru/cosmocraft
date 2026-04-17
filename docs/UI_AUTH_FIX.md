# 🎨 Изменения в UI авторизации

## Проблема
После авторизации окно входа оставалось на экране, перекрывая игру. При полёте вверх окно снова появлялось. После перезагрузки (Ctrl+Shift+R) оставалось только пустое окно без формы.

## Решение

### 1. Разделение контейнеров
- **auth-container** - фиксированный контейнер авторизации (z-index: 1000)
- **game-container** - контейнер игры (z-index: 1)

### 2. Скрытие авторизации
После успешного входа:
```javascript
authContainer.classList.add('hidden');  // opacity: 0, display: none
gameContainer.classList.add('active');  // display: block
```

### 3. Динамическая загрузка игры
Игра загружается только после авторизации:
```javascript
const { CosmoCraftGame } = await import('/dist/client/main.js');
window.game = new CosmoCraftGame();
await window.game.start();
```

### 4. Проверка сессии
При загрузке страницы:
- Проверяется сохранённый `accessToken`
- Если токен невалиден - пробуем обновить через `refreshToken`
- Если успешно - сразу показываем игру

### 5. Перенаправление после регистрации
После успешной регистрации:
```javascript
setTimeout(() => {
    window.location.href = `/verification.html?email=${email}`;
}, 2000);
```

## Структура HTML

```html
<!-- Экран авторизации -->
<div id="auth-container">
    <div class="form-container">
        <!-- Форма входа -->
    </div>
    <div class="stars">
        <canvas id="starfield"></canvas>
    </div>
</div>

<!-- Игра -->
<div id="game-container">
    <canvas id="game-canvas"></canvas>
</div>
```

## CSS

### Скрытие авторизации
```css
#auth-container.hidden {
    opacity: 0;
    pointer-events: none;
    display: none;
}

#game-container.active {
    display: block;
}
```

### Позиционирование
```css
#auth-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1000;
}

#game-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
}
```

## Результат

✅ После входа окно авторизации полностью исчезает  
✅ Игра разворачивается на весь экран  
✅ При перезагрузке проверяется сессия  
✅ Если сессия валидна - сразу показывается игра  
✅ После регистрации перенаправление на верификацию  

## Файлы

- `public/index.html` - основная страница с авторизацией
- `public/registration.html` - страница регистрации
- `public/verification.html` - страница подтверждения email
- `public/password-reset.html` - страница восстановления пароля
