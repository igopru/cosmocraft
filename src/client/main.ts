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
        
        this.wsClient = new WebSocketClient('ws://localhost:8080');
        this.hud = new HUD();
        this.buildMenu = new BuildMenu(this.wsClient);
        this.playerName = localStorage.getItem('playerName') || 'Gora';
        this.star = new VoxelStar(Math.floor(Math.random() * 1000000));
        
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
    
    public start() {
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
    
        // Вращаем куб
        if (this.cube) {
            this.cube.rotation.x += 0.01;
            this.cube.rotation.y += 0.01;
        }
    
        // Вращаем астероиды
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
    
        // Обновляем звезду
        this.star.update(0.016);
    
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


}
