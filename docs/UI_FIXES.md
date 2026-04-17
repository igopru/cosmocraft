# 🔧 Исправления UI авторизации и отображения игры

## Проблемы

1. **Окно авторизации оставалось после входа** - перекрывало игру
2. **При полёте вверх окно появлялось снова** - z-index конфликты
3. **После Ctrl+Shift+R оставалось пустое окно** - сессия не проверялась
4. **Canvas игры добавлялся в body** - конфликтовал с auth контейнером

## Решения

### 1. Разделение экранов

```html
<!-- Экран авторизации (z-index: 1000) -->
<div id="auth-screen">
    <div class="login-box">...</div>
    <div class="stars"><canvas id="starfield"></canvas></div>
</div>

<!-- Экран игры (z-index: 1) -->
<div id="game-screen">
    <canvas id="game-canvas"></canvas>
</div>
```

### 2. Переключение экранов

```javascript
function showGame() {
    authScreen.classList.add('hidden');  // display: none
    gameScreen.classList.add('active');  // display: block
    document.body.style.overflow = 'hidden';
    loadGame();
}
```

### 3. Renderer в правильный контейнер

**Было:**
```typescript
document.body.appendChild(this.renderer.domElement);
```

**Стало:**
```typescript
const gameContainer = document.getElementById('game-screen') || document.body;
gameContainer.appendChild(this.renderer.domElement);
this.renderer.domElement.id = 'game-canvas';
this.renderer.domElement.style.position = 'absolute';
this.renderer.domElement.style.top = '0';
this.renderer.domElement.style.left = '0';
this.renderer.domElement.style.width = '100%';
this.renderer.domElement.style.height = '100%';
```

### 4. Проверка сессии при загрузке

```javascript
window.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('accessToken');
    if (token) {
        // Проверяем токен
        const resp = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resp.ok && data.success) {
            showGame(); // Сразу показываем игру
            return;
        }
        
        // Пробуем обновить токен
        const refresh = localStorage.getItem('refreshToken');
        if (refresh) {
            const resp2 = await fetch('/api/auth/refresh', {...});
            if (resp2.ok) {
                localStorage.setItem('accessToken', newToken);
                showGame();
                return;
            }
        }
        
        // Сессия невалидна
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
    }
});
```

### 5. Динамическая загрузка игры

```javascript
async function loadGame() {
    try {
        const module = await import('/dist/client/main.js');
        const CosmoCraftGame = module.CosmoCraftGame;
        
        window.game = new CosmoCraftGame();
        await window.game.start();
    } catch (error) {
        console.error('Ошибка загрузки игры:', error);
    }
}
```

## CSS

```css
#auth-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1000;
}

#auth-screen.hidden {
    display: none;
}

#game-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: none;
    z-index: 1;
}

#game-screen.active {
    display: block;
}
```

## Результат

✅ После входа окно авторизации полностью исчезает  
✅ Игра разворачивается на весь экран  
✅ При перезагрузке проверяется сессия  
✅ Если сессия валидна - сразу показывается игра  
✅ Canvas игры добавляется в правильный контейнер  
✅ Нет конфликтов z-index  

## Файлы

- `public/index.html` - переписан с нуля
- `src/client/main.ts` - исправлен renderer
