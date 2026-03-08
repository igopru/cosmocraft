// src/client/StationManager.ts
import * as THREE from 'three';

export interface StationBlueprint {
    name: string;
    version: string;
    createdAt: string;
    gridSize: number;
    voxelCount: number;
    voxels: Array<{ x: number; y: number; z: number; type: string }>;
}

export class StationManager {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private stations: Map<string, THREE.Group> = new Map();
    
    // Для режима размещения
    private placementMode: boolean = false;
    private ghostStation: THREE.Group | null = null;
    private currentBlueprint: StationBlueprint | null = null;
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;
    private onPlacementComplete: ((success: boolean) => void) | null = null;
    private boundOnMouseMove: ((e: MouseEvent) => void) | null = null;
    private boundOnClick: ((e: MouseEvent) => void) | null = null;
    private boundOnKeyDown: ((e: KeyboardEvent) => void) | null = null;

    constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
        this.scene = scene;
        this.camera = camera;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
    }

    // Загрузка списка моделей с сервера
    async loadStationList(): Promise<string[]> {
        try {
            const response = await fetch('/api/stations');
            const data = await response.json();
            return data.stations || [];
        } catch (err) {
            console.error('Ошибка загрузки списка моделей:', err);
            return [];
        }
    }

    // Включение режима размещения станции
    async enablePlacementMode(filename: string, onComplete: (success: boolean) => void): Promise<boolean> {
        try {
            const name = filename.replace('.blueprint.json', '');
            
            // Загружаем данные станции
            const response = await fetch(`/api/stations/${name}`);
            if (!response.ok) {
                throw new Error('Не удалось загрузить модель');
            }

            const blueprint: StationBlueprint = await response.json();
            this.currentBlueprint = blueprint;
            this.onPlacementComplete = onComplete;

            // Создаём призрака станции
            this.createGhostStation(blueprint);
            
            // Включаем режим размещения
            this.placementMode = true;

            // Сохраняем ссылки на обработчики для последующего удаления
            this.boundOnMouseMove = this.onMouseMove.bind(this);
            this.boundOnClick = this.onClick.bind(this);
            this.boundOnKeyDown = this.onKeyDown.bind(this);

            // Добавляем обработчики событий
            window.addEventListener('mousemove', this.boundOnMouseMove);
            window.addEventListener('click', this.boundOnClick);
            window.addEventListener('keydown', this.boundOnKeyDown);

            console.log(`🎯 Режим размещения активирован для "${name}"`);
            return true;
        } catch (err) {
            console.error('Ошибка включения режима размещения:', err);
            return false;
        }
    }

    // Создание призрака станции
    private createGhostStation(blueprint: StationBlueprint) {
        if (this.ghostStation) {
            this.scene.remove(this.ghostStation);
        }

        this.ghostStation = new THREE.Group();
        const voxelSize = 8;

        // Вычисляем центр станции для центрирования
        const center = this.calculateCenter(blueprint);
        this.ghostStation.userData = {
            centerX: center.x,
            centerY: center.y,
            centerZ: center.z
        };

        for (const voxel of blueprint.voxels) {
            const mesh = this.createVoxelMesh(voxel.type, voxelSize, true);
            mesh.position.set(
                voxel.x * voxelSize,
                voxel.y * voxelSize,
                voxel.z * voxelSize
            );
            this.ghostStation.add(mesh);
        }

        // Полупрозрачный материал для призрака
        this.ghostStation.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                (child.material as THREE.MeshStandardMaterial).transparent = true;
                (child.material as THREE.MeshStandardMaterial).opacity = 0.5;
            }
        });

        this.scene.add(this.ghostStation);
        console.log('👻 Призрак станции создан');
    }

    // Обработка движения мыши
    private onMouseMove(event: MouseEvent) {
        if (!this.placementMode || !this.ghostStation) return;

        // Нормализованные координаты мыши
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Пускаем луч из камеры
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Ищем пересечения с объектами на сцене (исключаем саму станцию-призрак)
        const visibleObjects = this.scene.children.filter(child => child !== this.ghostStation);
        const intersects = this.raycaster.intersectObjects(visibleObjects, true);
        
        if (intersects.length > 0) {
            // Находим точку пересечения
            const point = intersects[0].point;
            
            // Вычисляем позицию для станции (округляем до размера вокселя)
            const gridSize = 8;
            const gridX = Math.round(point.x / gridSize) * gridSize;
            const gridY = Math.round(point.y / gridSize) * gridSize;
            const gridZ = Math.round(point.z / gridSize) * gridSize;
            
            // Позиционируем станцию так, чтобы её центр был в точке пересечения
            this.ghostStation.position.set(gridX, gridY, gridZ);
        }
    }

    // Обработка клика для размещения
    private onClick(event: MouseEvent) {
        if (!this.placementMode || !this.ghostStation) return;
        
        // Игнорируем клики по UI элементам
        const target = event.target as HTMLElement;
        if (target.closest('#station-menu') || target.closest('#build-menu')) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        // Размещаем станцию
        this.placeGhostStation();
    }

    // Обработка клавиш
    private onKeyDown(event: KeyboardEvent) {
        if (!this.placementMode) return;

        if (event.key === 'Escape') {
            this.cancelPlacement();
        }
    }

    // Размещение призрака на сцене
    private placeGhostStation() {
        if (!this.ghostStation || !this.currentBlueprint) return;

        // Создаём копию призрака для финальной станции
        const finalStation = this.ghostStation.clone();
        
        // Убираем прозрачность
        finalStation.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                (child.material as THREE.MeshStandardMaterial).transparent = false;
                (child.material as THREE.MeshStandardMaterial).opacity = 1;
            }
        });

        this.scene.add(finalStation);
        
        // Сохраняем в список станций
        const name = this.currentBlueprint.name;
        this.stations.set(name, finalStation);

        console.log(`✅ Станция "${name}" размещена в позиции:`, finalStation.position);

        // Очищаем режим размещения
        this.disablePlacementMode();

        // Уведомляем о завершении
        if (this.onPlacementComplete) {
            this.onPlacementComplete(true);
        }
    }

    // Отмена размещения
    private cancelPlacement() {
        console.log('❌ Размещение отменено');
        this.disablePlacementMode();
        
        if (this.onPlacementComplete) {
            this.onPlacementComplete(false);
        }
    }

    // Выключение режима размещения
    private disablePlacementMode() {
        this.placementMode = false;
        
        if (this.ghostStation) {
            this.scene.remove(this.ghostStation);
            this.ghostStation = null;
        }
        
        this.currentBlueprint = null;
        this.onPlacementComplete = null;

        // Удаляем обработчики событий
        if (this.boundOnMouseMove) {
            window.removeEventListener('mousemove', this.boundOnMouseMove);
            this.boundOnMouseMove = null;
        }
        if (this.boundOnClick) {
            window.removeEventListener('click', this.boundOnClick);
            this.boundOnClick = null;
        }
        if (this.boundOnKeyDown) {
            window.removeEventListener('keydown', this.boundOnKeyDown);
            this.boundOnKeyDown = null;
        }

        console.log('🎯 Режим размещения отключен');
    }

    // Загрузка и размещение модели на сцене (старый метод для совместимости)
    async placeStation(filename: string, position: THREE.Vector3): Promise<boolean> {
        try {
            const name = filename.replace('.blueprint.json', '');

            if (this.stations.has(name)) {
                console.log('Модель уже загружена:', name);
                return false;
            }

            const response = await fetch(`/api/stations/${name}`);
            if (!response.ok) {
                throw new Error('Не удалось загрузить модель');
            }

            const blueprint: StationBlueprint = await response.json();
            const stationGroup = new THREE.Group();
            stationGroup.position.copy(position);

            const voxelSize = 8;
            for (const voxel of blueprint.voxels) {
                const mesh = this.createVoxelMesh(voxel.type, voxelSize);
                mesh.position.set(
                    voxel.x * voxelSize,
                    voxel.y * voxelSize,
                    voxel.z * voxelSize
                );
                stationGroup.add(mesh);
            }

            this.scene.add(stationGroup);
            this.stations.set(name, stationGroup);

            console.log(`✅ Станция "${name}" размещена:`, position);
            return true;
        } catch (err) {
            console.error('Ошибка размещения станции:', err);
            return false;
        }
    }

    // Создание меша вокселя по типу
    private createVoxelMesh(type: string, size: number, isGhost: boolean = false): THREE.Mesh {
        const colors: Record<string, number> = {
            'hull_light': 0x888888,
            'hull_medium': 0x666666,
            'hull_heavy': 0x444444,
            'hull_reinforced': 0x222222,
            'solar_panel': 0x44aaff,
            'battery': 0xffaa44,
            'shield_gen': 0x44ffaa,
            'thruster': 0xff4444,
            'cargo_bay': 0xaa8844,
            'turret_mount': 0xaa44ff,
            'docking_port': 0x44aaff,
            'window': 0xaaddff,
            'light': 0xffffaa,
            'paint': 0x88aaff
        };

        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshStandardMaterial({
            color: colors[type] || 0x888888,
            emissive: type === 'solar_panel' ? 0x224466 : 0x000000,
            transparent: isGhost,
            opacity: isGhost ? 0.5 : (type === 'window' ? 0.7 : 1)
        });

        return new THREE.Mesh(geometry, material);
    }

    // Удаление станции
    removeStation(name: string): boolean {
        const station = this.stations.get(name);
        if (station) {
            this.scene.remove(station);
            this.stations.delete(name);
            console.log(`🗑️ Станция "${name}" удалена`);
            return true;
        }
        return false;
    }

    // Очистка всех станций
    clearAllStations() {
        this.stations.forEach(station => {
            this.scene.remove(station);
        });
        this.stations.clear();
        console.log('🧹 Все станции очищены');
    }

    // Получение списка загруженных станций
    getLoadedStations(): string[] {
        return Array.from(this.stations.keys());
    }

    // Проверка режима размещения
    isPlacementModeActive(): boolean {
        return this.placementMode;
    }

    // Вычисление центра станции для центрирования
    calculateCenter(blueprint: StationBlueprint): THREE.Vector3 {
        if (blueprint.voxels.length === 0) {
            return new THREE.Vector3(0, 0, 0);
        }

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const voxel of blueprint.voxels) {
            minX = Math.min(minX, voxel.x);
            maxX = Math.max(maxX, voxel.x);
            minY = Math.min(minY, voxel.y);
            maxY = Math.max(maxY, voxel.y);
            minZ = Math.min(minZ, voxel.z);
            maxZ = Math.max(maxZ, voxel.z);
        }

        return new THREE.Vector3(
            (minX + maxX) / 2 * 8,
            (minY + maxY) / 2 * 8,
            (minZ + maxZ) / 2 * 8
        );
    }
}
