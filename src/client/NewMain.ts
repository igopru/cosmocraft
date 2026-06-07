// src/client/NewMain.ts — тестовая замена main.ts с NewCentralStar
declare const window: any;
declare const document: any;
declare const localStorage: any;
declare const requestAnimationFrame: any;

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WebSocketClient } from './networking/WebSocketClient.js';
import { BuildMenu } from '../ui/BuildMenu.js';
import { HUD } from '../ui/HUD.js';
import { NewCentralStar } from '../star/NewCentralStar.js';
import { AsteroidField } from './AsteroidField.js';
import { StationModule } from './StationModule.js';
import { StationManager } from './StationManager.js';
import { ShipController } from './ShipController.js';
import { StationShop, StationInfo } from './StationShop.js';
import { BaseStation } from './BaseStation.js';

export class CosmoCraftGame {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private wsClient: WebSocketClient;
    private hud: HUD;
    private buildMenu: BuildMenu;
    private playerName: string;
    private playerIndex: string = '';
    private isRunning: boolean = false;
    private cube!: THREE.Mesh;
    private star: NewCentralStar;
    private asteroidField: AsteroidField | null = null;
    private modules: StationModule[] = [];
    private asteroids: THREE.Group[] = [];
    private stationManager: StationManager;
    private baseStation: BaseStation;
    private shipController: ShipController;
    private isFPVMode: boolean = true;
    private fpvUI: HTMLElement | null = null;
    private stationShop: StationShop;
    private globalKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;
    private cameraMode: 'follow' | 'orbit' = 'follow';
    private renderDistance: number = 3000;
    private visibleAsteroids: Map<string, THREE.Group> = new Map();
    private allAsteroidsData: any[] = [];

    constructor() {
        console.log('CosmoCraftGame constructor (NewMain)');

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111122);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
        this.camera.position.set(10, 10, 20);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.shadowMap.enabled = true;

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.enabled = false;

        const urlParams = new URLSearchParams(window.location.search);
        let serverHost = urlParams.get('server') || window.location.hostname;
        let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

        let wsPort = urlParams.get('ws_port');
        let wsPath = urlParams.get('ws_path') || '/ws';

        if (!wsPort) {
            if (wsPath && wsPath !== '/ws') {
                wsPort = '';
            } else if (window.location.hostname === 'cosmocraft.rupru.ru') {
                wsPort = '';
                wsPath = '/ws';
            } else if (window.location.protocol === 'https:') {
                wsPort = '';
            } else {
                wsPort = '8080';
                wsPath = '/ws';
            }
        }

        const portPart = wsPort ? `:${wsPort}` : '';
        const wsUrl = `${protocol}//${serverHost}${portPart}${wsPath}`;

        console.log('🔌 WebSocket URL:', wsUrl);
        console.log('📋 Params:', { serverHost, protocol, wsPort, wsPath });

        this.wsClient = new WebSocketClient(wsUrl);
        this.hud = new HUD();
        this.buildMenu = new BuildMenu(this.wsClient, this);
        const savedName = localStorage.getItem('playerName');
        if (savedName) {
            this.playerName = savedName;
        } else {
            const name = prompt('Введите имя пилота:', 'Pilot');
            this.playerName = name && name.trim() ? name.trim() : 'Pilot';
            localStorage.setItem('playerName', this.playerName);
        }
        this.star = new NewCentralStar(12);
        this.baseStation = new BaseStation(this.scene);
        this.shipController = new ShipController(
            this.camera,
            this.scene,
            this.renderer,
            new THREE.Vector3(0, 500, 0)
        );
        this.stationManager = new StationManager(this.scene, this.camera, this.shipController.getShip());
        this.shipController.setBaseStation(this.baseStation);
        this.shipController.setStationManager(this.stationManager);
        this.shipController.setWebSocketClient(this.wsClient);

        this.shipController.setOnStatusUpdate((status) => {
            this.hud.setShipStatus(status);
        });

        this.stationShop = new StationShop();
        this.stationShop.setShipController(this.shipController);

        this.setupGlobalKeyHandler();
        this.setupWebSocketHandlers();

        this.wsClient.on('playerData', (data) => {
            console.log('👤 Данные игрока:', data);
            this.playerIndex = data.playerIndex;
            this.playerName = data.playerName || this.playerName;
            localStorage.setItem('playerName', this.playerName);
            this.hud.showMessage(`Добро пожаловать, ${data.playerName}!`);
            this.shipController.setPlayerName(this.playerName);
            if (data.cargo) {
                this.shipController.setCargo(data.cargo);
            }
        });

        this.wsClient.on('asteroidsData', (data) => {
            this.renderAsteroids(data);
        });

        console.log('CosmoCraftGame created (NewMain)');
        console.log('Планет создано:', this.star.getPlanets().length);
        console.log('Планеты:', this.star.getPlanets().map(p => `${p.name} r=${p.radius} orb=${p.orbitalDistance}`));
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
        this.renderAsteroids(data);
      });

      const attemptLogin = () => {
        const name = this.playerName || localStorage.getItem('playerName');
        if (name) {
          this.wsClient.loginPlayer(name);
        } else {
          setTimeout(attemptLogin, 500);
        }
      };

      if ((this.wsClient as any).connected) {
        attemptLogin();
      } else {
        this.wsClient.on('connect', () => attemptLogin());
      }
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

        const gameContainer = document.getElementById('game-screen') || document.body;
        gameContainer.appendChild(this.renderer.domElement);
        this.renderer.domElement.id = 'game-canvas';
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';

        this.renderer.setSize(window.innerWidth, window.innerHeight);

        this.scene.add(this.star.mesh);
        this.scene.add(this.star.light);
        this.scene.add(this.star.glowLight);

        const ambientLight1 = new THREE.AmbientLight(0x404060);
        this.scene.add(ambientLight1);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(1, 2, 1);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        const ambientLight2 = new THREE.AmbientLight(0x443322);
        this.scene.add(ambientLight2);

        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshStandardMaterial({ color: 0xffaa33 });
        this.cube = new THREE.Mesh(geometry, material);
        this.cube.position.set(0, 1, 0);
        this.cube.castShadow = true;
        this.cube.receiveShadow = true;
        this.scene.add(this.cube);

        this.requestAsteroids();
        this.createStarfield();

        window.addEventListener('resize', () => this.onWindowResize());

        console.log('Game initialized');
    }

    private requestAsteroids() {
        console.log('🔄 Запрашиваем астероиды...');

        const urlParams = new URLSearchParams(window.location.search);
        this.renderDistance = parseInt(urlParams.get('renderDistance') || '3000');
        console.log('👁️ Дальность прорисовки:', this.renderDistance);

        if (this.wsClient) {
            this.wsClient.send('getAsteroids', {
                position: {
                    x: this.camera.position.x,
                    y: this.camera.position.y,
                    z: this.camera.position.z
                },
                radius: this.renderDistance
            });
        }
        setInterval(() => {
            if (this.wsClient) {
                this.wsClient.send('getAsteroids', {
                    position: {
                        x: this.camera.position.x,
                        y: this.camera.position.y,
                        z: this.camera.position.z
                    },
                    radius: this.renderDistance
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

        const delta = 0.016;

        if (this.cube) {
            this.cube.rotation.x += 0.01;
            this.cube.rotation.y += 0.01;
        }

        this.star.update(delta);

        this.baseStation.update(delta);
        this.stationManager.update(delta);

        this.visibleAsteroids.forEach(asteroid => {
            const speed = (asteroid as any).userData?.rotationSpeed;
            if (speed) {
                asteroid.rotation.x += speed.x;
                asteroid.rotation.y += speed.y;
                asteroid.rotation.z += speed.z;
            }
        });

        this.shipController.update(delta);

        const planets = this.star.getPlanetPositions();
        const shipPos = this.shipController.getPosition();
        let planetCollision = false;
        for (const p of planets) {
            const d = shipPos.distanceTo(p.position);
            if (d < p.dangerRadius) {
                const dir = new THREE.Vector3().copy(p.position).sub(shipPos).normalize();
                const strength = p.data.gravity * 3 * (1 - d / p.dangerRadius);
                shipPos.add(dir.multiplyScalar(strength * delta));

                if (d < p.data.radius * 1.5) {
                    planetCollision = true;
                }
            }
        }

        if (planetCollision) {
            this.hud.showMessage('💥 Столкновение с планетой! Корабль уничтожен.');
            shipPos.set(0, 500, 0);
            const shipGroup = this.shipController.getShip();
            shipGroup.position.set(0, 500, 0);
            this.camera.position.set(0, 500, 0);
        }

        this.hud.update({
            position: this.camera.position,
            sector: 'sector_1',
            temperature: 300,
            radiation: 10,
            resources: {
                metal: 1000,
                rare: 100
            }
        });

        this.renderer.render(this.scene, this.camera);
    }

    private renderAsteroids(asteroidsData: any[]) {
        this.allAsteroidsData = asteroidsData;
        this.updateVisibleAsteroids();
    }

    private updateVisibleAsteroids() {
        const cameraPos = this.camera.position;
        const toRemove: string[] = [];

        this.visibleAsteroids.forEach((asteroid, id) => {
            const data = this.allAsteroidsData.find(a => a.id === id);
            if (!data) {
                this.scene.remove(asteroid);
                toRemove.push(id);
                return;
            }

            const distance = cameraPos.distanceTo(new THREE.Vector3(data.position_x, data.position_y, data.position_z));
            if (distance > this.renderDistance) {
                this.scene.remove(asteroid);
                toRemove.push(id);
            }
        });

        toRemove.forEach(id => this.visibleAsteroids.delete(id));

        this.allAsteroidsData.forEach(data => {
            if (this.visibleAsteroids.has(data.id)) return;

            const distance = cameraPos.distanceTo(new THREE.Vector3(data.position_x, data.position_y, data.position_z));
            if (distance <= this.renderDistance) {
                const asteroid = this.createAsteroidMesh(data);
                this.scene.add(asteroid);
                this.visibleAsteroids.set(data.id, asteroid);
            }
        });
    }

    private createAsteroidMesh(data: any): THREE.Group {
        const group = new THREE.Group();

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
            default:
                baseColor = 0x888888;
                emissiveColor = 0x222222;
        }

        const voxelSize = 5;
        const size = 25;

        const cameraDistance = this.camera.position.distanceTo(
            new THREE.Vector3(data.position_x, data.position_y, data.position_z)
        );
        const detailFactor = Math.max(0.3, 1 - cameraDistance / (this.renderDistance * 1.5));

        for (let x = -size; x < size; x += voxelSize) {
            for (let y = -size; y < size; y += voxelSize) {
                for (let z = -size; z < size; z += voxelSize) {
                    const dist = Math.sqrt(x*x + y*y + z*z);
                    if (dist < size - voxelSize && Math.random() > (0.5 * detailFactor)) {
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

                        voxel.position.x += (Math.random() - 0.5) * 0.5;
                        voxel.position.y += (Math.random() - 0.5) * 0.5;
                        voxel.position.z += (Math.random() - 0.5) * 0.5;

                        group.add(voxel);
                    }
                }
            }
        }

        group.position.set(data.position_x, data.position_y, data.position_z);
        group.rotation.x = Math.random() * Math.PI * 2;
        group.rotation.y = Math.random() * Math.PI * 2;
        group.rotation.z = Math.random() * Math.PI * 2;

        (group as any).userData = {
            id: data.id,
            type: data.type,
            rotationSpeed: {
                x: (Math.random() - 0.5) * 0.005,
                y: (Math.random() - 0.5) * 0.005,
                z: (Math.random() - 0.5) * 0.005
            }
        };

        return group;
    }

    public async showStationMenu() {
        const stationList = await this.stationManager.loadStationList();
        const menu = document.getElementById('station-menu');
        const list = document.getElementById('station-list');

        if (!menu || !list) return;

        list.innerHTML = '';

        const header = document.createElement('h3');
        header.textContent = '🚀 Ваши станции';
        header.style.cssText = 'margin: 0 0 15px 0; color: #ffaa33; text-align: center;';
        list.appendChild(header);

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

                const placeBtn = document.createElement('button');
                placeBtn.textContent = 'Установить';
                placeBtn.style.cssText = 'margin-left: 10px; padding: 6px 12px; background: #44aa66; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;';
                placeBtn.onmouseover = () => placeBtn.style.background = '#55bb77';
                placeBtn.onmouseout = () => placeBtn.style.background = '#44aa66';
                placeBtn.onclick = async (e: MouseEvent) => {
                    e.stopPropagation();
                    this.hideStationMenu();
                    await this.stationManager.enablePlacementMode(filename, this.playerName, (success: boolean) => {
                        if (success) {
                            console.log('✅ Станция размещена');
                        } else {
                            console.log('❌ Размещение отменено');
                        }
                        this.showStationMenu();
                    });
                };

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
                            this.showStationMenu();
                        }
                    }
                };

                item.appendChild(placeBtn);
                item.appendChild(deleteBtn);
                list.appendChild(item);
            });
        }

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

    private planetInfoDialog: HTMLElement | null = null;

    private showPlanetInfo(planet: { position: THREE.Vector3; data: any; dangerRadius: number }) {
        const d = this.camera.position.distanceTo(planet.position);
        const p = planet.data;
        const info = [
            `🪐 ${p.name.toUpperCase()}`,
            `━━━━━━━━━━━━━━━━`,
            `Тип: ${p.composition}`,
            `Радиус: ${p.radius} м`,
            `Орбита: ${p.orbitalDistance} м`,
            `Дистанция: ${d.toFixed(0)} м`,
            `Температура: ${p.temperature}K`,
            `Гравитация: ${p.gravity} м/с²`,
            `Опасная зона: ${p.dangerRadius} м`,
            ``,
            `⚠️ При входе в опасную зону`,
        ].join('\n');
        this.showInfoDialog(info);
    }

    private removeInfoDialog() {
        if (this.planetInfoDialog) {
            this.planetInfoDialog.remove();
            this.planetInfoDialog = null;
        }
    }

    private showInfoDialog(text: string) {
        this.removeInfoDialog();
        const div = document.createElement('div');
        div.style.cssText = [
            'position: fixed', 'top: 50%', 'left: 50%', 'transform: translate(-50%, -50%)',
            'background: rgba(0,0,0,0.85)', 'border: 1px solid #4488ff', 'border-radius: 12px',
            'padding: 24px 32px', 'color: #fff', 'font-family: monospace', 'font-size: 14px',
            'z-index: 2000', 'white-space: pre', 'line-height: 1.6', 'min-width: 320px',
            'box-shadow: 0 0 40px rgba(68,136,255,0.2)',
        ].join(';');
        div.textContent = text;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'position:absolute;top:8px;right:12px;background:none;border:none;color:#888;font-size:20px;cursor:pointer';
        closeBtn.onclick = () => this.removeInfoDialog();
        div.appendChild(closeBtn);

        document.body.appendChild(div);
        this.planetInfoDialog = div;
    }

    private setupGlobalKeyHandler() {
        this.globalKeyDownHandler = (e: KeyboardEvent) => {
            if (e.code === 'KeyI') {
                const planets = this.star.getPlanetPositions();
                let nearest: typeof planets[0] | null = null;
                let minD = Infinity;
                const shipPos = this.shipController.getPosition();
                for (const p of planets) {
                    const d = shipPos.distanceTo(p.position);
                    if (d < minD) { minD = d; nearest = p; }
                }
                if (nearest && minD < nearest.dangerRadius * 5) {
                    this.showPlanetInfo(nearest);
                    return;
                }
                return;
            }

            if (e.code === 'KeyV') {
                if (this.stationShop.isVisibleShop()) {
                    this.stationShop.hide();
                } else {
                    const station = this.findNearestStation();
                    if (station) {
                        this.stationShop.show(station);
                    }
                }
            }

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
            if (distance < minDistance && distance < 500) {
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
}
