// src/client/main.ts
declare const window: any;
declare const document: any;
declare const localStorage: any;
declare const requestAnimationFrame: any;

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WebSocketClient } from './networking/WebSocketClient.js';
import { BuildMenu } from '../ui/BuildMenu.js';
import { HUD } from '../ui/HUD.js';
import { VoxelStar } from './VoxelStar.js';
import { AsteroidField } from './AsteroidField.js';
import { StationModule } from './StationModule.js';
import { StationManager } from './StationManager.js';
import { ShipController } from './ShipController.js';
import { StationShop, StationInfo } from './StationShop.js';

export class CosmoCraftGame {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private wsClient: WebSocketClient;
    private hud: HUD;
    private buildMenu: BuildMenu;
    private playerName: string;
    private isRunning: boolean = false;
    private cube!: THREE.Mesh;
    private star: VoxelStar;
    private asteroidField: AsteroidField | null = null;
    private modules: StationModule[] = [];
    private asteroids: THREE.Group[] = [];
    private stationManager: StationManager;
    private shipController: ShipController;
    private isFPVMode: boolean = true; // По умолчанию включен полёт
    private fpvUI: HTMLElement | null = null;
    private stationShop: StationShop;
    private globalKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;
    private cameraMode: 'follow' | 'orbit' = 'follow'; // follow = корабль, orbit = свободная камера
    
    constructor() {
        console.log('CosmoCraftGame constructor');

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111122);
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
        this.camera.position.set(10, 10, 20);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.enabled = false; // Отключаем сразу для POV режима
        
        this.wsClient = new WebSocketClient('ws://localhost:8080');
        this.hud = new HUD();
        this.buildMenu = new BuildMenu(this.wsClient, this);
        this.playerName = localStorage.getItem('playerName') || 'Gora';
        this.star = new VoxelStar(Math.floor(Math.random() * 1000000));
        this.stationManager = new StationManager(this.scene, this.camera);
        this.shipController = new ShipController(
            this.camera,
            this.scene,
            this.renderer,
            new THREE.Vector3(0, 500, 0) // Спавн над звездой на высоте 500 единиц
        );

        // Callback для обновления статуса корабля в HUD
        this.shipController.setOnStatusUpdate((status) => {
            this.hud.setShipStatus(status);
        });

        // Инициализация магазина станций
        this.stationShop = new StationShop();

        // Глобальный обработчик клавиш
        this.setupGlobalKeyHandler();

        this.setupWebSocketHandlers();
        this.wsClient.on('asteroidsData', (data) => {
            console.log('☄️ Получено астероидов:', data.length);
            this.renderAsteroids(data);
        });
        
        console.log('CosmoCraftGame created');
    }
    
    private setupWebSocketHandlers() {
      this.wsClient.on('init', (data) => {
        console.log('🌍 Текущий мир:', data.world);
        this.hud.showMessage(`Мир #${data.world.world_number}: ${data.world.name}`);
      });
  
      this.wsClient.on('worldInfo', (data) => {
        console.log('📊 Информация о мире:', data);
        this.hud.updateWorldInfo(data.currentWorld, data.playerLegacy);
      });
  
      this.wsClient.on('asteroidsData', (data) => {
        console.log('☄️ Получено астероидов:', data.length);
        // Здесь будем отрисовывать астероиды
      });
    }
    
    public async start() {
        console.log('Game start called');
        if (this.isRunning) return;
        this.isRunning = true;

        this.init();
        this.animate();
    }
    
    private init() {
        console.log('Initializing game');
        
        // Добавляем рендерер в DOM
        document.body.appendChild(this.renderer.domElement);
        
        // Добавляем звезду
        this.scene.add(this.star.getMesh());
        this.scene.add(this.star.getLight());
        
        // Освещение
        const ambientLight1 = new THREE.AmbientLight(0x404060);
        this.scene.add(ambientLight1);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(1, 2, 1);
        dirLight.castShadow = true;
        this.scene.add(dirLight);
        
        // Дополнительное освещение от звезды
        const ambientLight2 = new THREE.AmbientLight(0x443322);
        this.scene.add(ambientLight2);
        
        // Сетка для ориентации
        const gridHelper = new THREE.GridHelper(200, 20, 0x4444ff, 0x888888);
        this.scene.add(gridHelper);
        
        // Тестовый куб
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshStandardMaterial({ color: 0xffaa33 });
        this.cube = new THREE.Mesh(geometry, material);
        this.cube.position.set(0, 1, 0);
        this.cube.castShadow = true;
        this.cube.receiveShadow = true;
        this.scene.add(this.cube);
        
        // Создаем поле астероидов
        //this.asteroidField = new AsteroidField(this.scene, new THREE.Vector3(200, 0, 0), 100, 30);
        this.requestAsteroids();
        
        // Звезды
        this.createStarfield();
        
        // Обработка resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        console.log('Game initialized');
    }
    
    private requestAsteroids() {
        console.log('🔄 Запрашиваем астероиды...');
        // Запрашиваем каждые 5 секунд
        setInterval(() => {
            if (this.wsClient) {
                this.wsClient.send('getAsteroids', {
                    position: {
                        x: this.camera.position.x,
                        y: this.camera.position.y,
                        z: this.camera.position.z
                    },
                    radius: 3000
                });
            }
        }, 5000);
    }

    private createStarfield() {
        const starsGeo = new THREE.BufferGeometry();
        const starsCount = 2000;
        const positions = new Float32Array(starsCount * 3);
        
        for (let i = 0; i < starsCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 2000;
            positions[i+1] = (Math.random() - 0.5) * 2000;
            positions[i+2] = (Math.random() - 0.5) * 2000;
        }
        
        starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3 });
        const stars = new THREE.Points(starsGeo, starsMat);
        this.scene.add(stars);
    }
    
    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    private animate() {
        if (!this.isRunning) return;

        requestAnimationFrame(() => this.animate());

        const delta = 0.016; // Приблизительно 60 FPS

        // Вращаем тестовый куб
        if (this.cube) {
            this.cube.rotation.x += 0.01;
            this.cube.rotation.y += 0.01;
        }

        // Обновляем звезду (анимация ядра, короны, частиц)
        this.star.update(0.016);

        // Обновляем астероиды (вращение каждого астероида)
        if (this.asteroids) {
            this.asteroids.forEach(asteroid => {
                const speed = (asteroid as any).userData?.rotationSpeed;
                if (speed) {
                    asteroid.rotation.x += speed.x;
                    asteroid.rotation.y += speed.y;
                    asteroid.rotation.z += speed.z;
                }
            });
        }

        // Обновляем контроллер корабля (управление, физика)
        this.shipController.update(delta);

        // Обновляем HUD
        this.hud.update({
            position: this.camera.position,
            sector: 'sector_1',
            temperature: 300,
            radiation: 10,
            resources: {
                metal: 1000,
                silicon: 500,
                ice: 300,
                rare: 100
            }
        });

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    private renderAsteroids(asteroidsData: any[]) {
        console.log('🎨 Отрисовка астероидов:', asteroidsData.length);
    
        // Очищаем старые астероиды
        if (this.asteroids) {
            this.asteroids.forEach(a => this.scene.remove(a));
        }
    
        this.asteroids = [];
    
        asteroidsData.forEach(data => {
            // Создаем группу для воксельного астероида
            const group = new THREE.Group();
        
            // Определяем цвет на основе типа
            let baseColor: number;
            let emissiveColor: number;
        
            switch(data.type) {
                case 'silicon':
                    baseColor = 0x66aaff;
                    emissiveColor = 0x113366;
                    break;
                case 'icy':
                    baseColor = 0xaaddff;
                    emissiveColor = 0x224466;
                    break;
                case 'rare':
                    baseColor = 0xffaa44;
                    emissiveColor = 0x442200;
                    break;
                default: // metallic
                    baseColor = 0x888888;
                    emissiveColor = 0x222222;
            }
        
            // Генерируем воксели
            const voxelSize = 5;
            const size = 25; // размер астероида
        
            for (let x = -size; x < size; x += voxelSize) {
                for (let y = -size; y < size; y += voxelSize) {
                    for (let z = -size; z < size; z += voxelSize) {
                        // Проверяем, находится ли воксель внутри сферы
                        const dist = Math.sqrt(x*x + y*y + z*z);
                        if (dist < size - voxelSize && Math.random() > 0.5) {
                            // Размер вокселя зависит от расстояния до центра
                            const voxelScale = 0.8 + Math.random() * 1.2;
                        
                            const voxelGeo = new THREE.BoxGeometry(voxelSize * voxelScale, voxelSize * voxelScale, voxelSize * voxelScale);
                            const voxelMat = new THREE.MeshStandardMaterial({
                                color: baseColor,
                                emissive: emissiveColor,
                                emissiveIntensity: data.type === 'rare' ? 0.3 : 0.1,
                                roughness: 0.6,
                                metalness: data.type === 'metallic' ? 0.7 : 0.2
                            });
                        
                            const voxel = new THREE.Mesh(voxelGeo, voxelMat);
                            voxel.position.set(x, y, z);
                            voxel.castShadow = true;
                            voxel.receiveShadow = true;
                        
                            // Добавляем случайное смещение для более естественного вида
                            voxel.position.x += (Math.random() - 0.5) * 0.5;
                            voxel.position.y += (Math.random() - 0.5) * 0.5;
                            voxel.position.z += (Math.random() - 0.5) * 0.5;
                        
                            group.add(voxel);
                        }
                    }
                }
            }
        
            // Позиционируем астероид
            group.position.set(data.position_x, data.position_y, data.position_z);
        
            // Случайное вращение
            group.rotation.x = Math.random() * Math.PI * 2;
            group.rotation.y = Math.random() * Math.PI * 2;
            group.rotation.z = Math.random() * Math.PI * 2;
        
            // Сохраняем скорость вращения для анимации
            (group as any).userData = {
                id: data.id,
                type: data.type,
                rotationSpeed: {
                    x: (Math.random() - 0.5) * 0.005,
                    y: (Math.random() - 0.5) * 0.005,
                    z: (Math.random() - 0.5) * 0.005
                }
            };
    
            this.scene.add(group);
            this.asteroids.push(group);
        });

        console.log(`✅ Отрисовано астероидов: ${this.asteroids.length}`);
    }

    // Публичные методы для управления станциями
    public async showStationMenu() {
        const stationList = await this.stationManager.loadStationList();
        const menu = document.getElementById('station-menu');
        const list = document.getElementById('station-list');

        if (!menu || !list) return;

        list.innerHTML = '';

        // Заголовок меню
        const header = document.createElement('h3');
        header.textContent = '🚀 Ваши станции';
        header.style.cssText = 'margin: 0 0 15px 0; color: #ffaa33; text-align: center;';
        list.appendChild(header);

        // Подсказка
        const hint = document.createElement('div');
        hint.style.cssText = 'color: #aaa; padding: 10px; text-align: center; font-size: 13px; margin-bottom: 10px;';
        hint.textContent = 'Нажмите "Установить" для размещения станции. ESC для отмены.';
        list.appendChild(hint);

        if (stationList.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = 'color: #888; padding: 20px; text-align: center;';
            emptyMsg.textContent = 'Нет сохранённых моделей\nСоздайте станцию в конструкторе или загрузите JSON файл';
            emptyMsg.style.whiteSpace = 'pre-line';
            list.appendChild(emptyMsg);
        } else {
            stationList.forEach((filename: string) => {
                const name = filename.replace('.blueprint.json', '');
                const item = document.createElement('div');
                item.style.cssText = 'padding: 12px; margin: 8px 0; background: rgba(68, 102, 170, 0.6); border: 1px solid #5577bb; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;';
                item.onmouseover = () => item.style.background = 'rgba(68, 102, 170, 0.8)';
                item.onmouseout = () => item.style.background = 'rgba(68, 102, 170, 0.6)';
                item.innerHTML = `<span style="font-weight: bold;">🚀 ${name}</span>`;

                // Кнопка установки (режим размещения с призраком)
                const placeBtn = document.createElement('button');
                placeBtn.textContent = 'Установить';
                placeBtn.style.cssText = 'margin-left: 10px; padding: 6px 12px; background: #44aa66; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;';
                placeBtn.onmouseover = () => placeBtn.style.background = '#55bb77';
                placeBtn.onmouseout = () => placeBtn.style.background = '#44aa66';
                placeBtn.onclick = async (e: MouseEvent) => {
                    e.stopPropagation();
                    // Закрываем меню
                    this.hideStationMenu();
                    // Включаем режим размещения
                    await this.stationManager.enablePlacementMode(filename, (success: boolean) => {
                        if (success) {
                            console.log('✅ Станция размещена');
                        } else {
                            console.log('❌ Размещение отменено');
                        }
                        // Возвращаем меню
                        this.showStationMenu();
                    });
                };

                // Кнопка удаления
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Удалить';
                deleteBtn.style.cssText = 'margin-left: 5px; padding: 6px 12px; background: #aa4444; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;';
                deleteBtn.onmouseover = () => deleteBtn.style.background = '#bb5555';
                deleteBtn.onmouseout = () => deleteBtn.style.background = '#aa4444';
                deleteBtn.onclick = async (e: MouseEvent) => {
                    e.stopPropagation();
                    if (confirm(`Удалить модель "${name}"?`)) {
                        const response = await fetch(`/api/stations/${name}`, { method: 'DELETE' });
                        if (response.ok) {
                            this.stationManager.removeStation(name);
                            this.showStationMenu(); // Обновить список
                        }
                    }
                };

                item.appendChild(placeBtn);
                item.appendChild(deleteBtn);
                list.appendChild(item);
            });
        }

        // Кнопка закрытия
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕ Закрыть';
        closeBtn.style.cssText = 'margin-top: 15px; padding: 8px 20px; background: #666; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; width: 100%;';
        closeBtn.onclick = () => this.hideStationMenu();
        list.appendChild(closeBtn);

        menu.style.display = 'block';
    }

    public hideStationMenu() {
        const menu = document.getElementById('station-menu');
        if (menu) menu.style.display = 'none';
    }

    public getStationManager(): StationManager {
        return this.stationManager;
    }
    
    // ==================== Глобальные обработчики ====================
    
    private setupGlobalKeyHandler() {
        this.globalKeyDownHandler = (e: KeyboardEvent) => {
            // V - переключение магазина станций (приоритет)
            if (e.code === 'KeyV') {
                // Если магазин открыт - закрываем
                if (this.stationShop.isVisibleShop()) {
                    this.stationShop.hide();
                } else {
                    // Проверяем, есть ли станции рядом
                    const station = this.findNearestStation();
                    if (station) {
                        // Открываем магазин
                        this.stationShop.show(station);
                    }
                }
            }
            
            // C - переключение режима камеры (только в полёте)
            if (e.code === 'KeyC' && this.isFPVMode) {
                this.toggleCameraMode();
            }
        };
        
        document.addEventListener('keydown', this.globalKeyDownHandler);
    }
    
    private findNearestStation(): StationInfo | null {
        const stations = this.stationManager.getPlacedStations();
        if (stations.length === 0) return null;

        const shipPos = this.shipController.getPosition();
        let nearest: StationInfo | null = null;
        let minDistance = Infinity;

        for (const station of stations) {
            const distance = shipPos.distanceTo(station.position);
            if (distance < minDistance && distance < 500) { // В радиусе 500 единиц
                minDistance = distance;
                nearest = {
                    name: station.name,
                    position: station.position,
                    distance: distance,
                    owner: 'Player',
                    services: ['trade', 'repair', 'refuel']
                };
            }
        }

        return nearest;
    }
    
    // ==================== Режимы Камеры ====================
    
    /**
     * Переключение режима камеры
     * follow = камера привязана к кораблю (полёт)
     * orbit = свободная орбитальная камера (осмотр)
     */
    private toggleCameraMode() {
        this.cameraMode = this.cameraMode === 'follow' ? 'orbit' : 'follow';

        if (this.cameraMode === 'orbit') {
            console.log('📷 Режим осмотра: орбитальная камера');
            this.controls.enabled = true;
        } else {
            console.log('🚀 Режим полёта: камера корабля');
            this.controls.enabled = false;
        }
    }

    // ==================== FPV Режим ====================
    // Управление кораблём реализовано в ShipController
    // Клавиши: A/Z - тяга, Стрелки - вращение, Ctrl - лазер, O - люк
}
