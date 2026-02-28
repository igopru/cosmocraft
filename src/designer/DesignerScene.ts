// src/designer/DesignerScene.ts
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VoxelType, BlueprintStats } from '../types/voxel.js';
import { Voxel } from './Voxel.js';
import { Blueprint } from './BlueprintManager.js';

export class DesignerScene {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private grid: Voxel[][][] = [];
    private currentVoxelType: VoxelType = VoxelType.HULL_MEDIUM;
    private buildMode: 'place' | 'remove' | 'paint' = 'place';
    private blueprint: Blueprint | null = null;
    
    // Размер сетки конструктора
    private gridSize = 64; // 64x64x64 вокселей
    private voxelSize = 8;
    
    // методы для работы с вокселями
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;
    private highlightMesh: THREE.Mesh | null = null;

    constructor(container: HTMLElement) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111122);
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(50, 50, 100);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);
        
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        
        this.initGrid();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.createHighlightMesh();

        this.setupLights();
        this.setupRaycaster();
        this.animate();
    }
    
    private setupLights() {
        // Основной свет
        const ambientLight = new THREE.AmbientLight(0x404060);
        this.scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(1, 2, 1);
        dirLight.castShadow = true;
        this.scene.add(dirLight);
        
        // Подсветка снизу
        const backLight = new THREE.PointLight(0x4466aa, 0.5);
        backLight.position.set(-10, -10, -10);
        this.scene.add(backLight);
    }
    
    private initGrid() {
        // Создаем пустую сетку
        for (let x = 0; x < this.gridSize; x++) {
            this.grid[x] = [];
            for (let y = 0; y < this.gridSize; y++) {
                this.grid[x][y] = [];
                for (let z = 0; z < this.gridSize; z++) {
                    this.grid[x][y][z] = null as any;
                }
            }
        }
    
        // УБИРАЕМ направляющую сетку (комментируем или удаляем)
        // const gridHelper = new THREE.GridHelper(200, 20, 0x4444ff, 0x888888);
        // gridHelper.position.y = -this.voxelSize/2;
        // this.scene.add(gridHelper);
    
        // Добавляем оси для ориентации (можно тоже убрать если мешают)
        const axesHelper = new THREE.AxesHelper(50);
        this.scene.add(axesHelper);
    
        // Добавим несколько тестовых вокселей для проверки
        this.addTestVoxels();
    }
    

    // Новый метод для создания подсветки
    private createHighlightMesh() {
        const geometry = new THREE.BoxGeometry(this.voxelSize, this.voxelSize, this.voxelSize);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xffff00, 
            transparent: true, 
            opacity: 0.3,
            wireframe: true
        });
        this.highlightMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.highlightMesh);
    }

    private setupRaycaster() {
        this.renderer.domElement.addEventListener('mousemove', (event) => {
            // Вычисляем позицию мыши
            this.mouse.x = (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1;
        
            this.raycaster.setFromCamera(this.mouse, this.camera);
        
            // Проверяем пересечение с существующими вокселями
            const voxelMeshes: THREE.Mesh[] = [];
            for (let x = 0; x < this.gridSize; x++) {
                for (let y = 0; y < this.gridSize; y++) {
                    for (let z = 0; z < this.gridSize; z++) {
                        if (this.grid[x]?.[y]?.[z]) {
                            voxelMeshes.push(this.grid[x][y][z].mesh);
                        }
                    }
                }
            }
        
            const intersects = this.raycaster.intersectObjects(voxelMeshes);
        
            if (intersects.length > 0) {
                // Берем ближайший воксель
                const intersect = intersects[0];
                const hitVoxel = intersect.object;
            
                // Получаем нормаль поверхности, куда попали
                const faceNormal = intersect.face?.normal.clone();
                if (faceNormal) {
                    // Преобразуем нормаль в мировые координаты
                    faceNormal.applyQuaternion(hitVoxel.quaternion);
                
                    // Вычисляем центр вокселя, в который попали
                    const hitCenter = hitVoxel.position.clone();
                
                    // Вычисляем позицию для нового вокселя (смещение на 1 воксель по нормали)
                    const placePos = hitCenter.clone().add(
                        faceNormal.multiplyScalar(this.voxelSize)
                    );
                
                    // Округляем до сетки
                    const gridX = Math.round(placePos.x / this.voxelSize) * this.voxelSize;
                    const gridY = Math.round(placePos.y / this.voxelSize) * this.voxelSize;
                    const gridZ = Math.round(placePos.z / this.voxelSize) * this.voxelSize;
                
                    // Обновляем подсветку
                    if (this.highlightMesh) {
                        this.highlightMesh.position.set(gridX, gridY, gridZ);
                        this.highlightMesh.visible = true;
                    
                        // Сохраняем позицию и режим
                        (this.highlightMesh as any).targetPosition = { x: gridX, y: gridY, z: gridZ };
                        (this.highlightMesh as any).mode = 'place';
                    }
                
                    // Для удаления сохраняем позицию вокселя, в который попали
                    (window as any).deleteTarget = hitCenter.clone();
                    return;
                }
            } else {
                // Если нет пересечений - ищем место на сетке
                const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
                const targetPoint = new THREE.Vector3();
            
                if (this.raycaster.ray.intersectPlane(plane, targetPoint)) {
                    const gridX = Math.round(targetPoint.x / this.voxelSize) * this.voxelSize;
                    const gridY = Math.round(targetPoint.y / this.voxelSize) * this.voxelSize;
                    const gridZ = Math.round(targetPoint.z / this.voxelSize) * this.voxelSize;
                
                    if (this.highlightMesh) {
                        this.highlightMesh.position.set(gridX, gridY, gridZ);
                        this.highlightMesh.visible = true;
                        (this.highlightMesh as any).targetPosition = { x: gridX, y: gridY, z: gridZ };
                        (this.highlightMesh as any).mode = 'place';
                    }
                    (window as any).deleteTarget = null;
                } else {
                    if (this.highlightMesh) {
                        this.highlightMesh.visible = false;
                    }
                    (window as any).deleteTarget = null;
                }
            }
        });
    
        this.renderer.domElement.addEventListener('click', (event) => {
            if (this.buildMode === 'place' && this.highlightMesh?.visible) {
                const pos = (this.highlightMesh as any).targetPosition;
                if (pos) {
                    this.placeVoxel(pos.x, pos.y, pos.z);
                }
            } else if (this.buildMode === 'remove') {
                const deletePos = (window as any).deleteTarget;
                if (deletePos) {
                    this.removeVoxel(deletePos.x, deletePos.y, deletePos.z);
                }
            }
        });
    
        this.renderer.domElement.addEventListener('mouseleave', () => {
            if (this.highlightMesh) {
                this.highlightMesh.visible = false;
            }
            (window as any).deleteTarget = null;
        });
    }
    
    // Реализация placeVoxel
    private placeVoxel(x: number, y: number, z: number) {
        // Конвертируем мировые координаты в индексы сетки
        const gridX = Math.floor((x + this.gridSize * this.voxelSize / 2) / this.voxelSize);
        const gridY = Math.floor((y + this.gridSize * this.voxelSize / 2) / this.voxelSize);
        const gridZ = Math.floor((z + this.gridSize * this.voxelSize / 2) / this.voxelSize);
    
        // Проверяем границы
        if (gridX < 0 || gridX >= this.gridSize || 
            gridY < 0 || gridY >= this.gridSize || 
            gridZ < 0 || gridZ >= this.gridSize) {
            return;
        }
    
        // Проверяем, свободно ли место
        if (this.grid[gridX][gridY] && this.grid[gridX][gridY][gridZ]) {
            console.log('Место занято');
            return;
        }
    
        // Создаем новый воксель
        const voxel = new Voxel(this.currentVoxelType, new THREE.Vector3(x, y, z), this.voxelSize);
        this.scene.add(voxel.mesh);
    
        // Инициализируем массив если нужно
        if (!this.grid[gridX]) this.grid[gridX] = [];
        if (!this.grid[gridX][gridY]) this.grid[gridX][gridY] = [];
    
        this.grid[gridX][gridY][gridZ] = voxel;
    
        // Обновляем счетчик
        this.updateVoxelCount();
    
        console.log(`Воксель размещен: [${gridX}, ${gridY}, ${gridZ}]`);
    }
    // Реализация removeVoxel
    private removeVoxel(x: number, y: number, z: number) {
        // Конвертируем мировые координаты в индексы сетки
        const gridX = Math.floor((x + this.gridSize * this.voxelSize / 2) / this.voxelSize);
        const gridY = Math.floor((y + this.gridSize * this.voxelSize / 2) / this.voxelSize);
        const gridZ = Math.floor((z + this.gridSize * this.voxelSize / 2) / this.voxelSize);
    
        // Проверяем границы
        if (gridX < 0 || gridX >= this.gridSize || 
            gridY < 0 || gridY >= this.gridSize || 
            gridZ < 0 || gridZ >= this.gridSize) {
            return;
        }
    
        // Проверяем, есть ли воксель
        if (this.grid[gridX]?.[gridY]?.[gridZ]) {
            const voxel = this.grid[gridX][gridY][gridZ];
            this.scene.remove(voxel.mesh);
            voxel.dispose();
            this.grid[gridX][gridY][gridZ] = null as any;
        
            this.updateVoxelCount();
            console.log('Воксель удален');
        }
    }
    
    // Обновление счетчика вокселей
    private updateVoxelCount() {
        let count = 0;
        for (let x = 0; x < this.gridSize; x++) {
            for (let y = 0; y < this.gridSize; y++) {
                for (let z = 0; z < this.gridSize; z++) {
                    if (this.grid[x][y][z]) count++;
                }
            }
        }
    
        // Обновляем UI
        const voxelCountEl = document.getElementById('voxel-count');
        if (voxelCountEl) {
            voxelCountEl.textContent = count.toString();
        }
    
        // Пересчитываем характеристики при изменении
        this.updateStats();
    }

    public saveBlueprint(name: string): Blueprint {
        // Сохраняем текущую постройку как чертеж
        const voxelData = this.compressVoxelData();
        const stats = this.calculateStats();
        
        return {
            id: crypto.randomUUID(),
            name: name,
            description: '',
            authorId: 'current-user',
            size: [this.gridSize, this.gridSize, this.gridSize],
            voxels: [], // TODO: заполнить реальными данными
            stats: stats,
            isPublic: false,
            downloads: 0,
            likes: 0,
            createdAt: new Date()
        } as Blueprint;
    }
    
    public loadBlueprint(blueprint: Blueprint) {
        // Загружаем чертеж в конструктор
        this.clearGrid();
        this.decompressVoxelData(blueprint.voxels);
    }
    
// Публичный метод для смены типа вокселя
    public setCurrentVoxelType(type: string) {
        // Конвертируем строку в enum
        switch(type) {
            case 'hull_light': this.currentVoxelType = VoxelType.HULL_LIGHT; break;
            case 'hull_medium': this.currentVoxelType = VoxelType.HULL_MEDIUM; break;
            case 'hull_heavy': this.currentVoxelType = VoxelType.HULL_HEAVY; break;
            case 'hull_reinforced': this.currentVoxelType = VoxelType.HULL_REINFORCED; break;
            case 'solar_panel': this.currentVoxelType = VoxelType.SOLAR_PANEL; break;
            case 'battery': this.currentVoxelType = VoxelType.BATTERY; break;
            case 'shield_gen': this.currentVoxelType = VoxelType.SHIELD_GEN; break;
            case 'thruster': this.currentVoxelType = VoxelType.THRUSTER; break;
            case 'cargo_bay': this.currentVoxelType = VoxelType.CARGO_BAY; break;
            case 'turret_mount': this.currentVoxelType = VoxelType.TURRET_MOUNT; break;
            case 'docking_port': this.currentVoxelType = VoxelType.DOCKING_PORT; break;
            case 'window': this.currentVoxelType = VoxelType.WINDOW; break;
            case 'light': this.currentVoxelType = VoxelType.LIGHT; break;
            case 'paint': this.currentVoxelType = VoxelType.PAINT; break;
            default: this.currentVoxelType = VoxelType.HULL_MEDIUM;
        }
        console.log('Тип вокселя изменен на:', type);
    }

    // Публичный метод для смены режима
    public setBuildMode(mode: 'place' | 'remove' | 'paint') {
        this.buildMode = mode;
        console.log('Режим изменен на:', mode);
    }

    private clearGrid() {
        // Очищаем сетку
        for (let x = 0; x < this.gridSize; x++) {
            for (let y = 0; y < this.gridSize; y++) {
                for (let z = 0; z < this.gridSize; z++) {
                    if (this.grid[x][y][z]) {
                        this.scene.remove(this.grid[x][y][z].mesh);
                    }
                    this.grid[x][y][z] = null as any;
                }
            }
        }
    }
    
    private decompressVoxelData(voxels: any[]) {
        // Восстанавливаем воксели из данных
        // TODO: реализовать
    }
    
    private calculateStats(): BlueprintStats {
        // Подсчет характеристик
        return {
            powerGeneration: 0,
            powerConsumption: 0,
            cargoCapacity: 0,
            shieldStrength: 0,
            weaponSlots: 0,
            totalHealth: 0,
            voxelCount: 0,
            resourceCost: { metal: 0, silicon: 0, ice: 0, rare: 0 }
        };
    }
    
    private compressVoxelData(): Uint8Array {
        // Сжимаем данные для хранения
        return new Uint8Array();
    }
    
    private animate() {
        requestAnimationFrame(() => this.animate());
        
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

   // Обновление характеристик
   private updateStats() {
       // TODO: пересчитать энергию, щиты и т.д.
   }


}
