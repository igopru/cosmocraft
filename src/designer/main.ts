// src/designer/main.ts
import { DesignerScene } from './DesignerScene.js';

console.log('🎨 Конструктор CosmoCraft загружен');

// Глобальные функции для кнопок (объявляем сразу)
(window as any).setMode = (mode: string) => {
    console.log('Режим:', mode);
    const modeDisplay = document.getElementById('mode-display');
    if (modeDisplay) {
        const modeText = mode === 'place' ? 'Строительство' :
                        mode === 'remove' ? 'Удаление' : 'Покраска';
        modeDisplay.textContent = modeText;
    }
    
    // Передаем режим в сцену
    const designer = (window as any).designer;
    if (designer) {
        designer.setBuildMode(mode as any);
    }
};

(window as any).saveBlueprint = () => {
    const name = prompt('Введите название чертежа:');
    if (name) {
        console.log('Сохранение чертежа:', name);
        const designer = (window as any).designer;
        if (designer) {
            const blueprint = designer.saveBlueprint(name);
            console.log('Чертеж сохранен:', blueprint);
            alert(`Чертеж "${name}" сохранен!`);
        }
    }
};

(window as any).loadBlueprint = () => {
    console.log('Загрузка чертежа');
    alert('Функция загрузки будет доступна позже');
};

(window as any).exportToGame = () => {
    console.log('Экспорт в игру');
    alert('Функция экспорта в игру будет доступна позже');
};

(window as any).clearAll = () => {
    if (confirm('Очистить всё?')) {
        console.log('Очистка');
        const designer = (window as any).designer;
        if (designer) {
            // designer.clearGrid();
            alert('Очистка пока не реализована');
        }
    }
};

// Ждем загрузки DOM
window.addEventListener('load', () => {
    console.log('📦 Инициализация конструктора...');
    
    try {
        // Создаем сцену
        const container = document.body;
        const designer = new DesignerScene(container);
        
        // Сохраняем в глобальную переменную для доступа из кнопок
        (window as any).designer = designer;
        
        // Создаем палитру вокселей
        createVoxelPalette();
        
        // Назначаем обработчики на кнопки (альтернативный способ)
        setupButtonHandlers();
        
        console.log('✅ Конструктор инициализирован');
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
    }
});

// Альтернативный способ назначения обработчиков
function setupButtonHandlers() {
    document.getElementById('mode-place')?.addEventListener('click', () => (window as any).setMode('place'));
    document.getElementById('mode-remove')?.addEventListener('click', () => (window as any).setMode('remove'));
    document.getElementById('mode-paint')?.addEventListener('click', () => (window as any).setMode('paint'));
    document.getElementById('save-blueprint')?.addEventListener('click', () => (window as any).saveBlueprint());
    document.getElementById('load-blueprint')?.addEventListener('click', () => (window as any).loadBlueprint());
    document.getElementById('export-game')?.addEventListener('click', () => (window as any).exportToGame());
    document.getElementById('clear-all')?.addEventListener('click', () => (window as any).clearAll());
}


// Выбор типа вокселя
function selectVoxelType(type: string) {
    console.log('Выбран тип:', type);
    const designer = (window as any).designer;
    if (designer) {
        designer.setCurrentVoxelType(type);
    }
}

// Создание палитры вокселей
function createVoxelPalette() {
    const palette = document.getElementById('voxel-palette');
    if (!palette) return;
    
    const voxelTypes = [
        { type: 'hull_light', name: 'Легкий корпус', color: '#888888' },
        { type: 'hull_medium', name: 'Средний корпус', color: '#666666' },
        { type: 'hull_heavy', name: 'Тяжелый корпус', color: '#444444' },
        { type: 'hull_reinforced', name: 'Усиленный', color: '#222222' },
        { type: 'solar_panel', name: 'Солнечная панель', color: '#44aaff' },
        { type: 'battery', name: 'Аккумулятор', color: '#ffaa44' },
        { type: 'shield_gen', name: 'Генератор щита', color: '#44ffaa' },
        { type: 'thruster', name: 'Двигатель', color: '#ff4444' },
        { type: 'cargo_bay', name: 'Грузовой отсек', color: '#aa8844' },
        { type: 'turret_mount', name: 'Крепление турели', color: '#aa44ff' },
        { type: 'docking_port', name: 'Стыковочный узел', color: '#44aaff' },
        { type: 'window', name: 'Окно', color: '#aaddff' },
        { type: 'light', name: 'Свет', color: '#ffffaa' },
        { type: 'paint', name: 'Краска', color: '#88aaff' }
    ];
    
    voxelTypes.forEach(vt => {
        const btn = document.createElement('div');
        btn.className = 'voxel-button';
        btn.style.backgroundColor = vt.color;
        btn.title = vt.name;
        btn.setAttribute('data-type', vt.type);
        
        btn.onclick = (event) => {
            // Убираем выделение со всех кнопок
            document.querySelectorAll('.voxel-button').forEach(b => {
                b.classList.remove('selected');
            });
            
            // Выделяем текущую кнопку
            const target = event.currentTarget as HTMLElement;
            target.classList.add('selected');
            
            // Получаем тип
            const type = target.getAttribute('data-type');
            if (type) {
                console.log('Выбран тип:', type);
                // TODO: передать в сцену
            }
        };
        
        palette.appendChild(btn);
    });
}
