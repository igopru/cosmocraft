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
    private ignoreNextClick: boolean = true;
    private currentBlueprint: StationBlueprint | null = null;
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;
    private placementSeed: THREE.Mesh | null = null; // "Зерно" — маркер посадки
    private isBuilding = false; // Флаг: идёт ли строительство
    private buildVoxels: THREE.Mesh[] = []; // Воксели для анимации строительства
    private buildIndex = 0; // Индекс текущего вокселя
    private seedShipRef: any = null; // Ссылка на корабль для отталкивания
    private onPlacementComplete: ((success: boolean) => void) | null = null;
    private boundOnMouseMove: ((e: MouseEvent) => void) | null = null;
    private boundOnClick: ((e: MouseEvent) => void) | null = null;
    private boundOnKeyDown: ((e: KeyboardEvent) => void) | null = null;

    constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, ship?: THREE.Group) {
        this.scene = scene;
        this.camera = camera;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.seedShipRef = ship || null;
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

    // Включение режима размещения станции (режим "посадочного зерна" как в X-Tension)
    async enablePlacementMode(filename: string, playerName: string, onComplete: (success: boolean) => void): Promise<boolean> {
        try {
            const name = filename.replace('.blueprint.json', '');
            console.log('🎯 [SM] enablePlacementMode called:', name, playerName);

            // Загружаем данные станции
            const response = await fetch(`/api/stations/${name}`, {
                headers: { 'X-Player-Name': playerName },
            });
            console.log('🎯 [SM] fetch response:', response.status);
            if (!response.ok) {
                const errText = await response.text();
                console.error('🎯 [SM] error body:', errText.substring(0, 300));
                throw new Error(`Не удалось загрузить модель (${response.status}): ${errText.substring(0, 200)}`);
            }

            const blueprint: StationBlueprint = await response.json();
            console.log('🎯 [SM] blueprint loaded, voxels:', blueprint.voxels?.length || blueprint.voxelCount);
            this.currentBlueprint = blueprint;
            this.onPlacementComplete = onComplete;
            this.placementMode = true;
            this.ignoreNextClick = true;

            // Создаём "зерно" — маленький маркер перед камерой
            this.createPlacementSeed();

            // Сохраняем ссылки на обработчики
            this.boundOnMouseMove = this.onMouseMove.bind(this);
            this.boundOnClick = this.onClick.bind(this);
            this.boundOnKeyDown = this.onKeyDown.bind(this);

            // Добавляем обработчики с задержкой
            setTimeout(() => {
                if (this.placementMode) {
                    window.removeEventListener('mousemove', this.boundOnMouseMove as EventListener);
                    window.removeEventListener('click', this.boundOnClick as EventListener);
                    window.removeEventListener('keydown', this.boundOnKeyDown as EventListener);
                    
                    window.addEventListener('mousemove', this.boundOnMouseMove as EventListener);
                    window.addEventListener('click', this.boundOnClick as EventListener);
                    window.addEventListener('keydown', this.boundOnKeyDown as EventListener);
                    console.log('🎯 [SM] Режим посадки: кликните ЛКМ чтобы посадить станцию');
                }
            }, 100);
            return true;
        } catch (err) {
            console.error('Ошибка включения режима размещения:', err);
            return false;
        }
    }

    // Создание "зерна" — маркера посадки (прямо перед носом корабля, 30 единиц)
    private createPlacementSeed() {
        // Удаляем старое зерно
        if (this.placementSeed) {
            this.scene.remove(this.placementSeed);
        }

        // Маленькая светящаяся сфера
        const geo = new THREE.SphereGeometry(5, 16, 16);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x44aaff,
            emissive: 0x44aaff,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.9,
        });
        this.placementSeed = new THREE.Mesh(geo, mat);

        // Позиционируем прямо перед носом корабля — 30 единиц
        if (this.seedShipRef) {
            const shipDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.seedShipRef.quaternion);
            this.placementSeed.position.copy(this.seedShipRef.position).add(shipDir.multiplyScalar(110));
        } else {
            const camDir = new THREE.Vector3();
            this.camera.getWorldDirection(camDir);
            this.placementSeed.position.copy(this.camera.position).add(camDir.clone().multiplyScalar(110));
        }
        
        // Ограничиваем зону
        this.clampToPlacementZone(this.placementSeed.position);
        this.placementSeed.visible = true;
        this.scene.add(this.placementSeed);
        
        console.log('🌱 Зерно посадки создано (110 ед. перед кораблём)');
    }

    // Обновление зерна (следует за кораблём/камерой)
    private updateSeedPosition() {
        if (!this.placementSeed) return;
        
        if (this.seedShipRef) {
            const shipDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.seedShipRef.quaternion);
            this.placementSeed.position.copy(this.seedShipRef.position).add(shipDir.multiplyScalar(110));
        } else {
            const camDir = new THREE.Vector3();
            this.camera.getWorldDirection(camDir);
            this.placementSeed.position.copy(this.camera.position).add(camDir.clone().multiplyScalar(110));
        }
        
        this.clampToPlacementZone(this.placementSeed.position);
    }

    // Проверка и отталкивание корабля если слишком близко к зерну
    private checkSeedRepulsion(): void {
        if (!this.placementSeed || !this.seedShipRef || !this.isBuilding) return;
        
        const dist = this.placementSeed.position.distanceTo(this.seedShipRef.position);
        if (dist < 60) {
            // Отталкиваем корабль
            const pushDir = this.seedShipRef.position.clone().sub(this.placementSeed.position).normalize();
            const pushStrength = (60 - dist) * 0.1;
            this.seedShipRef.position.add(pushDir.multiplyScalar(pushStrength));
        }
    }

    // Обработка движения мыши — обновляем зерно
    private onMouseMove(event: MouseEvent) {
        if (!this.placementMode || this.isBuilding) return;
        this.updateSeedPosition();
    }

    // Обработка клика для размещения (сброс зерна)
    private onClick(event: MouseEvent) {
        if (this.ignoreNextClick) {
            this.ignoreNextClick = false;
            return;
        }
        if (!this.placementMode || !this.placementSeed || this.isBuilding) return;

        // Игнорируем клики по UI элементам
        const target = event.target as HTMLElement;
        if (target.closest('#station-menu') || target.closest('#build-menu')) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        // Начинаем строительство станции
        this.startStationConstruction();
    }

    // Запуск строительства станции (кат-сцена)
    private startStationConstruction() {
        if (!this.currentBlueprint || !this.placementSeed) return;

        // Зерно = точка где будет самая нижняя/ближняя точка станции
        const seedPos = this.placementSeed.position.clone();
        const bp = this.currentBlueprint;
        const center = this.calculateCenter(bp);
        const voxelSize = 12;

        // Вычисляем минимальные координаты вокселей (нижний край станции)
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        for (const voxel of bp.voxels) {
            minX = Math.min(minX, (voxel.x - center.x));
            minY = Math.min(minY, (voxel.y - center.y));
            minZ = Math.min(minZ, (voxel.z - center.z));
        }

        // Смещение центра: чтобы нижний край вокселей был в точке зерна
        const offsetX = -minX * voxelSize;
        const offsetY = -minY * voxelSize;
        const offsetZ = -minZ * voxelSize;

        this.isBuilding = true;
        this.buildIndex = 0;

        // Создаём все воксели с scale=0
        this.buildVoxels = [];
        for (const voxel of bp.voxels) {
            const geo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
            const color = this.getVoxelColor(voxel.type);
            const mat = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.7,
                metalness: 0.3,
                transparent: true,
                opacity: 1,
            });
            const mesh = new THREE.Mesh(geo, mat);
            // Позиция вокселя: от зерна + смещение
            mesh.position.set(
                seedPos.x + (voxel.x - center.x) * voxelSize + offsetX,
                seedPos.y + (voxel.y - center.y) * voxelSize + offsetY,
                seedPos.z + (voxel.z - center.z) * voxelSize + offsetZ
            );
            mesh.scale.set(0, 0, 0); // Начинаем с нуля — будут расти
            this.scene.add(mesh);
            this.buildVoxels.push(mesh);
        }

        // Перемешиваем порядок появления
        for (let i = this.buildVoxels.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.buildVoxels[i], this.buildVoxels[j]] = [this.buildVoxels[j], this.buildVoxels[i]];
        }

        // Скрываем зерно — оно "запускает" роботов
        this.placementSeed.visible = false;

        console.log(`🤖 Строительство "${bp.name}" начато! Вокселей: ${bp.voxels.length}, центр: ${seedPos.x.toFixed(0)},${seedPos.y.toFixed(0)},${seedPos.z.toFixed(0)}`);
    }

    // Обновление строительства (вызывается каждый кадр)
    updateBuildAnimation(dt: number): void {
        if (!this.isBuilding || this.buildVoxels.length === 0) return;

        // Показываем 1 воксель каждые ~0.05 сек (20 вокселей/сек)
        const voxelsPerFrame = Math.max(1, Math.ceil(dt * 20));

        for (let i = 0; i < voxelsPerFrame && this.buildIndex < this.buildVoxels.length; i++) {
            this.buildIndex++;
        }

        // Плавное увеличение scale для всех активных вокселей
        const growSpeed = 2.5; // скорость роста
        for (let i = 0; i < this.buildIndex && i < this.buildVoxels.length; i++) {
            const mesh = this.buildVoxels[i];
            if (mesh.scale.x < 1) {
                const newScale = Math.min(1, mesh.scale.x + dt * growSpeed);
                mesh.scale.set(newScale, newScale, newScale);
            }
        }

        // Проверяем завершение
        if (this.buildIndex >= this.buildVoxels.length) {
            const allDone = this.buildVoxels.every(m => m.scale.x >= 0.99);
            if (allDone) {
                this.finishConstruction();
            }
        }

        // Отталкиваем корабль если близко
        this.checkSeedRepulsion();
    }

    // Завершение строительства
    private finishConstruction() {
        this.isBuilding = false;

        const bp = this.currentBlueprint!;
        if (!this.currentBlueprint || !this.placementSeed) return;
        
        // Вычисляем те же смещения что и в startStationConstruction
        const center = this.calculateCenter(this.currentBlueprint);
        const voxelSize = 12;
        const seedPos = this.placementSeed.position.clone();

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        for (const voxel of bp.voxels) {
            minX = Math.min(minX, (voxel.x - center.x));
            minY = Math.min(minY, (voxel.y - center.y));
            minZ = Math.min(minZ, (voxel.z - center.z));
        }
        const offsetX = -minX * voxelSize;
        const offsetY = -minY * voxelSize;
        const offsetZ = -minZ * voxelSize;

        // Создаём финальную станцию (те же позиции что и временные воксели)
        const finalStation = new THREE.Group();
        for (const voxel of bp.voxels) {
            const geo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
            const color = this.getVoxelColor(voxel.type);
            const mat = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.7,
                metalness: 0.3,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(
                seedPos.x + (voxel.x - center.x) * voxelSize + offsetX,
                seedPos.y + (voxel.y - center.y) * voxelSize + offsetY,
                seedPos.z + (voxel.z - center.z) * voxelSize + offsetZ
            );
            finalStation.add(mesh);
        }

        finalStation.name = bp.name;
        this.scene.add(finalStation);
        
        // Удаляем временные воксели
        for (const mesh of this.buildVoxels) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
        }
        this.buildVoxels = [];
        
        const name = bp.name;
        this.stations.set(name, finalStation);
        
        console.log(`✅ Станция "${name}" построена! Вокселей: ${bp.voxels.length}`);

        this.disablePlacementMode();

        if (this.onPlacementComplete) {
            this.onPlacementComplete(true);
        }
    }

    // Обработка клавиш
    private onKeyDown(event: KeyboardEvent) {
        if (!this.placementMode) return;

        if (event.key === 'Escape') {
            this.cancelPlacement();
        }
    }

    // Получить цвет вокселя по типу (согласовано с дизайнером)
    private getVoxelColor(type: string): number {
        const colors: Record<string, number> = {
            hull_light: 0x888888,
            hull_medium: 0x666666,
            hull_heavy: 0x444444,
            hull_reinforced: 0x222222,
            hull: 0x888888,
            solar_panel: 0x44aaff,
            battery: 0xffaa44,
            shield_gen: 0x44ffaa,
            thruster: 0xff4444,
            engine: 0xff4444,
            cargo_bay: 0xaa8844,
            storage: 0xaa8844,
            turret_mount: 0xaa44ff,
            docking_port: 0x44aaff,
            antenna: 0xffaa44,
            window: 0xaaddff,
            light: 0xffffaa,
            paint: 0x88aaff,
            habitat: 0x44aaff,
            radiator: 0xff4444,
            lab: 0x8844ff,
            connector: 0x555555,
        };
        return colors[type] || 0x888888;
    }

    // Ограничение позиции допустимой зоной
    private clampToPlacementZone(pos: THREE.Vector3) {
        const dist = pos.length();
        if (dist < 250) {
            pos.normalize().multiplyScalar(250);
        } else if (dist > 1500) {
            pos.normalize().multiplyScalar(1500);
        }
    }

    // Публичный метод для обновления строительства (вызывается из main.ts)
    update(dt: number): void {
        this.updateBuildAnimation(dt);
        // Обновляем зерно если не строим
        if (this.placementMode && !this.isBuilding) {
            this.updateSeedPosition();
        }
    }

    // Построить станцию в заданной позиции (устаревший метод — теперь используется startStationConstruction)
    private buildStationAtPosition(pos: THREE.Vector3) {
        if (!this.currentBlueprint) return;

        const bp = this.currentBlueprint!;
        const finalStation = new THREE.Group();
        finalStation.position.copy(pos);
        finalStation.name = bp.name;
        
        if (!this.currentBlueprint) return;
        const center = this.calculateCenter(this.currentBlueprint);
        const voxelSize = 12;
        for (const voxel of bp.voxels) {
            const geo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
            const color = this.getVoxelColor(voxel.type);
            const mat = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.7,
                metalness: 0.3,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(
                (voxel.x - center.x) * voxelSize,
                (voxel.y - center.y) * voxelSize,
                (voxel.z - center.z) * voxelSize
            );
            finalStation.add(mesh);
        }

        this.scene.add(finalStation);
        const name = bp.name;
        this.stations.set(name, finalStation);

        console.log(`✅ Станция "${name}" посажена в позиции:`, pos, `| вокселей: ${bp.voxels.length}`);

        this.disablePlacementMode();

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
        this.isBuilding = false;
        this.buildIndex = 0;
        
        // Удаляем зерно
        if (this.placementSeed) {
            this.scene.remove(this.placementSeed);
            this.placementSeed.geometry.dispose();
            (this.placementSeed.material as THREE.Material).dispose();
            this.placementSeed = null;
        }

        // Удаляем временные воксели строительства
        for (const mesh of this.buildVoxels) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
        }
        this.buildVoxels = [];
        this.seedShipRef = null;

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
            
            // Добавляем стандартные свойства для идентификации
            stationGroup.userData = {
                isStation: true,
                stationName: name,
                owner: 'Player',
                services: ['water', 'energy', 'rockets']
            };

            const voxelSize = 12;
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
    
    // Получение списка размещённых станций с позициями (для посадки)
    getPlacedStations(): Array<{ name: string; position: THREE.Vector3 }> {
        const stations: Array<{ name: string; position: THREE.Vector3 }> = [];
        this.stations.forEach((station, name) => {
            stations.push({
                name,
                position: station.position.clone()
            });
        });
        return stations;
    }
}
