// src/ui/BuildMenu.ts
import { WebSocketClient } from '../client/networking/WebSocketClient.js';

export class BuildMenu {
    private container: HTMLDivElement;
    private wsClient: WebSocketClient;
    private game: any;

    constructor(wsClient: WebSocketClient, game: any) {
        console.log('BuildMenu constructor');
        this.wsClient = wsClient;
        this.game = game;
        this.container = document.getElementById('build-menu') as HTMLDivElement;

        if (this.container) {
            this.createMenu();
        }
    }

    private createMenu() {
        this.container.innerHTML = '';
        this.container.style.display = 'flex';
        this.container.style.gap = '10px';
        this.container.style.padding = '10px';
        this.container.style.background = 'rgba(0,0,0,0.8)';
        this.container.style.borderRadius = '10px';

        // Кнопка перехода в конструктор
        const designerBtn = document.createElement('button');
        designerBtn.textContent = '🛠️ Конструктор';
        designerBtn.title = 'Создать новую станцию';
        designerBtn.style.padding = '10px 15px';
        designerBtn.style.background = '#4466aa';
        designerBtn.style.color = 'white';
        designerBtn.style.border = '1px solid #5577bb';
        designerBtn.style.borderRadius = '5px';
        designerBtn.style.cursor = 'pointer';
        designerBtn.style.fontWeight = 'bold';
        designerBtn.onclick = () => {
            window.location.href = '/designer.html';
        };
        this.container.appendChild(designerBtn);

        // Кнопка "Станции" - показывает список сохранённых моделей
        const stationsBtn = document.createElement('button');
        stationsBtn.textContent = '🚀 Станции';
        stationsBtn.title = 'Показать список станций';
        stationsBtn.style.padding = '10px 15px';
        stationsBtn.style.background = '#44aa66';
        stationsBtn.style.color = 'white';
        stationsBtn.style.border = '1px solid #55bb77';
        stationsBtn.style.borderRadius = '5px';
        stationsBtn.style.cursor = 'pointer';
        stationsBtn.style.fontWeight = 'bold';
        stationsBtn.onclick = () => {
            if (this.game && this.game.showStationMenu) {
                this.game.showStationMenu();
            }
        };
        this.container.appendChild(stationsBtn);

        // Кнопка "Добавить" - загрузка JSON файла
        const addBtn = document.createElement('button');
        addBtn.textContent = '📥 Добавить';
        addBtn.title = 'Загрузить станцию из JSON файла';
        addBtn.style.padding = '10px 15px';
        addBtn.style.background = '#aa6644';
        addBtn.style.color = 'white';
        addBtn.style.border = '1px solid #bb7755';
        addBtn.style.borderRadius = '5px';
        addBtn.style.cursor = 'pointer';
        addBtn.style.fontWeight = 'bold';
        addBtn.onclick = () => {
            this.openFileLoader();
        };
        this.container.appendChild(addBtn);

        // Скрытый input для загрузки файлов
        const fileInput = document.createElement('input');
        fileInput.id = 'station-file-input';
        fileInput.type = 'file';
        fileInput.accept = '.json,.blueprint';
        fileInput.style.display = 'none';
        fileInput.onchange = (e) => {
            this.handleFileUpload(e);
        };
        this.container.appendChild(fileInput);

        // Кнопки модулей закомментированы - экономика станции требует заполнения материалами
        // Солнечные панели и турели будут доступны после настройки экономики
        /*
        const modules = [
            { type: 'solar', name: 'Солнечные панели', cost: '50M' },
            { type: 'turret', name: 'Турель', cost: '150M' }
        ];

        modules.forEach(module => {
            const btn = document.createElement('button');
            btn.textContent = module.name;
            btn.title = `Стоимость: ${module.cost}`;

            btn.style.padding = '10px 15px';
            btn.style.background = '#333';
            btn.style.color = 'white';
            btn.style.border = '1px solid #666';
            btn.style.borderRadius = '5px';
            btn.style.cursor = 'pointer';

            btn.onclick = () => {
                console.log('Build:', module.type);
                alert(`Строительство ${module.name} пока в разработке`);
            };

            this.container.appendChild(btn);
        });
        */
    }

    // Открытие диалога выбора файла
    private openFileLoader() {
        const input = document.getElementById('station-file-input') as HTMLInputElement;
        if (input) {
            input.click();
        }
    }

    // Обработка загрузки файла
    private async handleFileUpload(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target?.result as string);
                    
                    // Проверяем формат данных
                    if (!data.voxels || !Array.isArray(data.voxels)) {
                        alert('❌ Неверный формат файла. Ожидается .blueprint.json');
                        return;
                    }

                    // Запрашиваем название для станции
                    const name = prompt('Введите название станции:', file.name.replace(/\.json$|\.blueprint$/, ''));
                    if (!name) return;

                    // Сохраняем на сервер
                    const response = await fetch('/api/stations', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            name, 
                            data: {
                                name,
                                version: data.version || '1.0',
                                voxels: data.voxels,
                                voxelCount: data.voxelCount || data.voxels.length
                            }
                        })
                    });

                    const result = await response.json();

                    if (response.status === 409) {
                        const overwrite = confirm(`Станция "${name}" уже существует. Перезаписать?`);
                        if (!overwrite) return;

                        const updateResponse = await fetch(`/api/stations/${name}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                data: {
                                    name,
                                    version: data.version || '1.0',
                                    voxels: data.voxels,
                                    voxelCount: data.voxelCount || data.voxels.length
                                }
                            })
                        });

                        if (updateResponse.ok) {
                            alert(`✅ Станция "${name}" обновлена!`);
                            if (this.game && this.game.showStationMenu) {
                                this.game.showStationMenu();
                            }
                        } else {
                            alert('❌ Ошибка при обновлении станции');
                        }
                    } else if (response.ok) {
                        alert(`✅ Станция "${name}" загружена!`);
                        if (this.game && this.game.showStationMenu) {
                            this.game.showStationMenu();
                        }
                    } else {
                        alert('❌ Ошибка: ' + (result.error || 'Неизвестная ошибка'));
                    }
                } catch (err) {
                    console.error('Ошибка парсинга JSON:', err);
                    alert('❌ Ошибка: неверный формат JSON');
                }
            };
            reader.readAsText(file);
        } catch (err) {
            console.error('Ошибка загрузки файла:', err);
            alert('❌ Ошибка при загрузке файла');
        }

        // Очищаем input для возможности повторной загрузки того же файла
        event.target.value = '';
    }
}
