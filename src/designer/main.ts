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
    const name = prompt('Введите название чертежа:', 'MyStation');
    if (!name) return;

    const designer = (window as any).designer;
    if (!designer || !designer.exportBlueprint) return;

    // Экспортируем чертеж
    const data = designer.exportBlueprint(name);
    const json = JSON.stringify(data, null, 2);

    // Создаем и скачиваем файл
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9]/gi, '_')}.blueprint.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('✅ Чертеж сохранён:', name);
    alert(`Чертеж "${name}" сохранён в файл!`);
};

// Сохранение корабля в папку players/ID/plane
(window as any).saveShip = async () => {
    const name = prompt('Введите название корабля:', 'MyShip');
    if (!name) return;

    const designer = (window as any).designer;
    if (!designer || !designer.exportBlueprint) return;

    const data = designer.exportBlueprint(name);
    const playerName = localStorage.getItem('playerName') || 'default';

    try {
        const response = await fetch('/api/ships', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, data, playerName })
        });

        const result = await response.json();

        if (response.ok) {
            alert(`✅ Корабль "${name}" сохранён!`);
        } else if (response.status === 409) {
            const overwrite = confirm(`Корабль "${name}" уже существует. Перезаписать?`);
            if (!overwrite) return;
            // Обновляем существующий
            const updateResponse = await fetch(`/api/ships/${name}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data, playerName })
            });
            if (updateResponse.ok) {
                alert(`✅ Корабль "${name}" обновлён!`);
            } else {
                alert('❌ Ошибка при обновлении корабля');
            }
        } else {
            alert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (err: any) {
        console.error('Ошибка:', err);
        alert('❌ Ошибка соединения с сервером: ' + err.message);
    }
};

// Сохранение станции в папку players/ID/station
(window as any).saveStation = async () => {
    const name = prompt('Введите название станции:', 'MyStation');
    if (!name) return;

    const designer = (window as any).designer;
    if (!designer || !designer.exportBlueprint) return;

    const data = designer.exportBlueprint(name);
    const playerName = localStorage.getItem('playerName') || 'default';

    try {
        const response = await fetch('/api/stations/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, data, playerName })
        });

        const result = await response.json();

        if (response.ok) {
            alert(`✅ Станция "${name}" сохранена!`);
        } else if (response.status === 409) {
            const overwrite = confirm(`Станция "${name}" уже существует. Перезаписать?`);
            if (!overwrite) return;
            // Обновляем существующую
            const updateResponse = await fetch(`/api/stations/save/${name}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data, playerName })
            });
            if (updateResponse.ok) {
                alert(`✅ Станция "${name}" обновлена!`);
            } else {
                alert('❌ Ошибка при обновлении станции');
            }
        } else {
            alert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (err: any) {
        console.error('Ошибка:', err);
        alert('❌ Ошибка соединения с сервером: ' + err.message);
    }
};

(window as any).loadBlueprint = () => {
    const input = document.getElementById('file-input') as HTMLInputElement;
    if (input) input.click();
};

// Обработка загрузки файла
document.getElementById('file-input')?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target?.result as string);
            const designer = (window as any).designer;
            if (designer && designer.importBlueprint) {
                designer.importBlueprint(data);
            }
        } catch (err) {
            console.error('Ошибка:', err);
            alert('Ошибка: неверный формат файла');
        }
    };
    reader.readAsText(file);
    (e.target as HTMLInputElement).value = '';
});

(window as any).clearAll = () => {
    if (confirm('Очистить всё?')) {
        const designer = (window as any).designer;
        if (designer && designer.clearGrid) {
            designer.clearGrid();
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
    document.getElementById('save-ship')?.addEventListener('click', () => (window as any).saveShip());
    document.getElementById('save-station')?.addEventListener('click', () => (window as any).saveStation());
    document.getElementById('save-blueprint')?.addEventListener('click', () => (window as any).saveBlueprint());
    document.getElementById('load-blueprint')?.addEventListener('click', () => (window as any).loadBlueprint());
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
        // Создаём контейнер для элемента
        const item = document.createElement('div');
        item.className = 'voxel-item';

        // Кнопка
        const btn = document.createElement('div');
        btn.className = 'voxel-button';
        btn.style.backgroundColor = vt.color;
        btn.title = vt.name;
        btn.setAttribute('data-type', vt.type);

        // Подпись
        const label = document.createElement('span');
        label.className = 'voxel-label';
        label.textContent = vt.name;

        btn.onclick = (event) => {
            // Убираем выделение со всех кнопок
            document.querySelectorAll('.voxel-button').forEach(b => {
                b.classList.remove('selected');
            });

            // Выделяем текущую кнопку
            const target = event.currentTarget as HTMLElement;
            target.classList.add('selected');

            // Получаем тип и передаем в сцену
            const type = target.getAttribute('data-type');
            if (type) {
                console.log('Выбран тип:', type);
                const designer = (window as any).designer;
                if (designer) {
                    designer.setCurrentVoxelType(type);
                }
            }
        };

        item.appendChild(btn);
        item.appendChild(label);
        palette.appendChild(item);
    });
}
