// src/client/ShipController.ts
import * as THREE from 'three';

export interface ResourceVoxel {
    id: number;
    mesh: THREE.Mesh;
    type: 'metal' | 'silicon' | 'ice' | 'rare';
    velocity: THREE.Vector3;
    rotationSpeed: THREE.Vector3;
    asteroidId: number | null;
    isCollected: boolean;
}

export interface ShipStatus {
    speed: number;
    maxSpeed: number;
    throttle: number;
    turboMode: boolean;
    setaMode: boolean;
    setaBoost: boolean;
    cargoBayOpen: boolean;
    laserActive: boolean;
    currentMissile: string;
    shields: number;
    energy: number;
    energyCapacity: number;
    water: number;
    waterCapacity: number;
    radiation: number;
    starChargeRate: number;
    cargo: {
        metal: number;
        silicon: number;
        ice: number;
        rare: number;
    };
    satellitesDeployed: number;
}

export interface ResourceParticle {
    id: number;
    mesh: THREE.Mesh;
    type: 'metal' | 'silicon' | 'ice' | 'rare';
    velocity: THREE.Vector3;
    asteroidId: number | null;
    isCollected: boolean;
}

export class ShipController {
    private camera: THREE.PerspectiveCamera;
    private scene: THREE.Scene;
    private renderer: THREE.WebGLRenderer;

    // Позиция и вращение корабля
    private shipPosition: THREE.Vector3 = new THREE.Vector3();
    private shipQuaternion: THREE.Quaternion = new THREE.Quaternion();

    // Группа корабля (для камеры как дочернего объекта)
    private ship: THREE.Group;

    // Скорость и движение
    private velocity: THREE.Vector3;
    private speed: number = 0;
    private maxSpeed: number = 100;
    private throttle: number = 0; // 0-100%
    private acceleration: number = 50; // м/с²

    // Энергия и ресурсы
    private energy: number = 500;        // Текущая энергия
    private energyCapacity: number = 1000; // Максимум энергии
    private water: number = 100;         // Вода (бак)
    private waterCapacity: number = 100; // Ёмкость бака
    private radiation: number = 0;       // Текущая радиация (%)

    // Звезда
    private starPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
    private starChargeRate: number = 0;  // Текущая зарядка от звезды

    // Режимы
    private turboMode: boolean = false;
    private setaMode: boolean = false;
    private setaBoost: boolean = false;

    // Состояние систем
    private cargoBayOpen: boolean = false;
    private laserActive: boolean = false;
    private currentMissile: string = 'None';

    // Щиты и столкновения
    private shields: number = 100; // 100%
    private collisionCooldown: boolean = false;

    // Груз и ресурсы
    private cargo: { metal: number; silicon: number; ice: number; rare: number } = {
        metal: 0,
        silicon: 0,
        ice: 0,
        rare: 0
    };
    private resourceParticles: ResourceParticle[] = [];
    private nextParticleId: number = 0;
    private collectionDistance: number = 15; // Дистанция сбора ресурсов

    // Спутники
    private satellites: THREE.Mesh[] = [];
    private satellitesDeployed: number = 0;

    // Обработчики
    private boundKeyDown: (e: KeyboardEvent) => void;
    private boundKeyUp: (e: KeyboardEvent) => void;
    private boundMouseMove: (e: MouseEvent) => void;
    private boundMouseDown: (e: MouseEvent) => void;

    // Состояние клавиш
    private keysPressed: Set<string> = new Set();

    // Позиция мыши для raycasting
    private mousePosition: THREE.Vector2 = new THREE.Vector2(0, 0);
    private mouseWorldPosition: THREE.Vector3 | null = null;
    private hoveredObject: THREE.Object3D | null = null;

    // Выделение объекта и автонаведение
    private selectedObject: THREE.Object3D | null = null;
    private selectedObjectMarker: THREE.Mesh | null = null;
    private isAutoTargeting: boolean = false;

    // Лазерная визуализация
    private laserBeamLeft: THREE.Line | null = null;   // Левый лазер
    private laserBeamRight: THREE.Line | null = null;  // Правый лазер
    private laserHitSphere: THREE.Mesh | null = null;
    private laserFiring: boolean = false;
    private laserCooldown: boolean = false;
    private laserFireRate: number = 0.15;
    private laserEnergyCost: number = 1;  // Энергия на выстрел (зависит от престижа)

    // HUD элементы
    private energyHUD: HTMLElement | null = null;
    private waterHUD: HTMLElement | null = null;
    private radiationHUD: HTMLElement | null = null;
    private starChargeHUD: HTMLElement | null = null;

    // Мерцание экрана в ауре
    private auraPulseOverlay: HTMLElement | null = null;
    private auraPulseAlpha: number = 0;

    // Воксели ресурсов
    private resourceVoxels: ResourceVoxel[] = [];
    private nextVoxelId: number = 0;

    // Векторы направления корабля (локальные оси)
    private shipForward: THREE.Vector3 = new THREE.Vector3(0, 0, -1);
    private shipRight: THREE.Vector3 = new THREE.Vector3(1, 0, 0);
    private shipUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

    // Callback
    private onStatusUpdate: ((status: ShipStatus) => void) | null = null;

    // Ссылка на астероиды для добычи
    private asteroids: THREE.Group[] = [];

    constructor(
        camera: THREE.PerspectiveCamera,
        scene: THREE.Scene,
        renderer: THREE.WebGLRenderer,
        startPosition: THREE.Vector3
    ) {
        this.camera = camera;
        this.scene = scene;
        this.renderer = renderer;

        // Создаём группу корабля
        this.ship = new THREE.Group();
        this.scene.add(this.ship);

        // Инициализация позиции корабля
        this.shipPosition.copy(startPosition);
        this.ship.position.copy(this.shipPosition);
        this.shipQuaternion.identity();
        this.ship.quaternion.copy(this.shipQuaternion);
        this.velocity = new THREE.Vector3();

        this.boundKeyDown = this.onKeyDown.bind(this);
        this.boundKeyUp = this.onKeyUp.bind(this);
        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundMouseDown = this.onMouseDown.bind(this);

        this.setupEventListeners();
        this.createLaserVisuals();
        this.createEnergyHUD();
        this.createAuraOverlay();

        // НЕ добавляем камеру как дочерний объект - будем копировать матрицу явно
        // Это предотвращает авто-выравнивание камеры движком Three.js
        // this.ship.add(this.camera);  // Закомментировано!

        // Устанавливаем камеру в позицию корабля
        // Камера смотрит вперёд по локальной оси -Z
        this.camera.position.set(0, 0, 0);

        // ВАЖНО: Отключаем авто-выравнивание камеры
        // Камера должна быть "тупой" - никаких lookAt, никаких up.set()
        this.camera.up.set(0, 0, 1);  // "Верх" камеры = локальная ось Z корабля
        this.camera.matrixAutoUpdate = true;

        // Поворачиваем корабль носом вниз к звезде (вращение вокруг оси X на 90°)
        this.ship.rotateX(Math.PI / 2);

        // Инициализируем локальные векторы после поворота
        this.shipForward.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
        this.shipRight.set(1, 0, 0).applyQuaternion(this.ship.quaternion);
        this.shipUp.set(0, 1, 0).applyQuaternion(this.ship.quaternion);
    }

    private setupEventListeners() {
        window.addEventListener('keydown', this.boundKeyDown);
        window.addEventListener('keyup', this.boundKeyUp);
        window.addEventListener('mousemove', this.boundMouseMove);
        window.addEventListener('mousedown', this.boundMouseDown);
    }

    // Обработка клика мыши для выделения объекта
    private onMouseDown(event: MouseEvent) {
        if (event.button !== 0) return; // Только левая кнопка

        if (this.hoveredObject) {
            this.selectObject(this.hoveredObject);
        } else {
            this.deselectObject();
        }
    }

    // Выделение объекта
    private selectObject(obj: THREE.Object3D) {
        // Снимаем выделение с предыдущего
        this.deselectObject();

        this.selectedObject = obj;
        this.isAutoTargeting = true;

        // Создаём маркер выделения (перекрестие)
        this.createSelectionMarker();
    }

    // Снятие выделения
    private deselectObject() {
        this.selectedObject = null;
        this.isAutoTargeting = false;

        if (this.selectedObjectMarker) {
            this.scene.remove(this.selectedObjectMarker);
            this.selectedObjectMarker.geometry.dispose();
            (this.selectedObjectMarker.material as THREE.Material).dispose();
            this.selectedObjectMarker = null;
        }
    }

    // Создание маркера выделения
    private createSelectionMarker() {
        if (!this.selectedObject) return;

        const markerGeo = new THREE.RingGeometry(2, 3, 32);
        const markerMat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        this.selectedObjectMarker = new THREE.Mesh(markerGeo, markerMat);
        this.selectedObjectMarker.position.copy(this.selectedObject.position);
        this.selectedObjectMarker.lookAt(this.camera.position);
        this.scene.add(this.selectedObjectMarker);
    }

    // Обновление маркера выделения
    private updateSelectionMarker() {
        if (!this.selectedObjectMarker || !this.selectedObject) return;

        // Маркер следует за объектом
        this.selectedObjectMarker.position.copy(this.selectedObject.position);
        this.selectedObjectMarker.lookAt(this.camera.position);
    }

    // Автонаведение на выделенный объект
    private handleAutoTargeting(deltaTime: number) {
        if (!this.isAutoTargeting || !this.selectedObject) return;

        const targetPos = this.selectedObject.position;
        const toTarget = new THREE.Vector3().subVectors(targetPos, this.shipPosition);
        toTarget.normalize();

        // Текущее направление корабля
        const forward = this.shipForward.clone().normalize();

        // Угол между направлением и целью
        const angle = forward.angleTo(toTarget);

        if (angle > 0.05) {
            const rotationSpeed = 3.0 * deltaTime;

            // Ось вращения
            const axis = new THREE.Vector3().crossVectors(forward, toTarget);
            if (axis.length() > 0.001) {
                axis.normalize();
                const q = new THREE.Quaternion();
                q.setFromAxisAngle(axis, Math.min(angle, rotationSpeed));
                this.ship.quaternion.premultiply(q);
                this.ship.quaternion.normalize();

                // Обновляем локальные векторы
                this.shipForward.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
                this.shipRight.set(1, 0, 0).applyQuaternion(this.ship.quaternion);
                this.shipUp.set(0, 1, 0).applyQuaternion(this.ship.quaternion);
            }
        }
    }

    // Обработка движения мыши для raycasting
    private onMouseMove(event: MouseEvent) {
        // Нормализованные координаты мыши (-1 до +1)
        this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Raycasting для определения объекта под мышью
        this.updateHoveredObject();
    }

    // Обновление объекта под мышью
    private updateHoveredObject() {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(this.mousePosition, this.camera);

        // Ищем пересечения со всеми объектами сцены, кроме GridHelper
        const intersectableObjects = this.scene.children.filter(child => 
            !(child instanceof THREE.GridHelper)
        );
        const intersects = raycaster.intersectObjects(intersectableObjects, true);

        if (intersects.length > 0) {
            // Проходим по всем пересечениям
            for (const intersect of intersects) {
                let obj: THREE.Object3D | null = intersect.object;
                
                // Проверяем сам объект и его родителей
                while (obj) {
                    // Звезда (по имени)
                    if (obj.name === 'star') {
                        this.hoveredObject = obj;
                        this.mouseWorldPosition = intersect.point.clone();
                        return;
                    }
                    
                    // Станция (по userData)
                    if (obj.userData?.isStation) {
                        this.hoveredObject = obj;
                        this.mouseWorldPosition = intersect.point.clone();
                        return;
                    }
                    
                    // Астероид (по типу)
                    if (obj.userData?.type) {
                        this.hoveredObject = obj;
                        this.mouseWorldPosition = intersect.point.clone();
                        return;
                    }
                    
                    obj = obj.parent || null;
                }
            }

            // Если ничего не нашли
            this.hoveredObject = null;
            this.mouseWorldPosition = null;
        } else {
            this.hoveredObject = null;
            this.mouseWorldPosition = null;
        }
    }

    // Создание визуальных эффектов лазера (два луча: левый и правый)
    private createLaserVisuals() {
        const laserMaterial = new THREE.LineBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.8
        });

        // Левый лазер (из левого нижнего угла)
        const leftGeometry = new THREE.BufferGeometry();
        const leftPositions = new Float32Array([0, 0, 0, 0, 0, -100]);
        leftGeometry.setAttribute('position', new THREE.BufferAttribute(leftPositions, 3));
        this.laserBeamLeft = new THREE.Line(leftGeometry, laserMaterial);
        this.laserBeamLeft.visible = false;
        this.scene.add(this.laserBeamLeft);

        // Правый лазер (из правого нижнего угла)
        const rightGeometry = new THREE.BufferGeometry();
        const rightPositions = new Float32Array([0, 0, 0, 0, 0, -100]);
        rightGeometry.setAttribute('position', new THREE.BufferAttribute(rightPositions, 3));
        this.laserBeamRight = new THREE.Line(rightGeometry, laserMaterial);
        this.laserBeamRight.visible = false;
        this.scene.add(this.laserBeamRight);

        // Сфера попадания
        const sphereGeometry = new THREE.SphereGeometry(2, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        this.laserHitSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        this.laserHitSphere.visible = false;
        this.scene.add(this.laserHitSphere);
    }

    // Создание HUD энергии
    private createEnergyHUD() {
        // Энергия (внизу слева, компактный прямоугольник)
        this.energyHUD = document.createElement('div');
        this.energyHUD.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 10px;
            width: 140px;
            padding: 6px;
            background: rgba(0, 50, 100, 0.8);
            border: 2px solid #4488ff;
            border-radius: 5px;
            color: #fff;
            font-family: 'Courier New', monospace;
            font-size: 10px;
            z-index: 1000;
        `;
        this.energyHUD.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <strong>⚡</strong>
                <div style="flex: 1; margin: 0 4px; height: 10px; background: #002244; border-radius: 2px; overflow: hidden;">
                    <div id="energy-bar" style="width: 50%; height: 100%; background: linear-gradient(90deg, #ff8800, #ffcc00); transition: width 0.3s;"></div>
                </div>
                <span id="energy-text" style="min-width: 45px; text-align: right;">500/1k</span>
            </div>
        `;
        document.body.appendChild(this.energyHUD);

        // Вода (слева от энергии с отступом, компактный прямоугольник)
        this.waterHUD = document.createElement('div');
        this.waterHUD.style.cssText = `
            position: fixed;
            bottom: 10px;
            left: 175px;
            width: 140px;
            padding: 6px;
            background: rgba(0, 100, 150, 0.8);
            border: 2px solid #44aaff;
            border-radius: 5px;
            color: #fff;
            font-family: 'Courier New', monospace;
            font-size: 10px;
            z-index: 1000;
        `;
        this.waterHUD.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <strong>💧</strong>
                <div style="flex: 1; margin: 0 4px; height: 10px; background: #003355; border-radius: 2px; overflow: hidden;">
                    <div id="water-bar" style="width: 100%; height: 100%; background: linear-gradient(90deg, #0066cc, #00aaff); transition: width 0.3s;"></div>
                </div>
                <span id="water-text" style="min-width: 45px; text-align: right;">100/100</span>
            </div>
        `;
        document.body.appendChild(this.waterHUD);

        // Радиация (справа вверху)
        this.radiationHUD = document.createElement('div');
        this.radiationHUD.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 200px;
            padding: 15px;
            background: rgba(100, 50, 0, 0.8);
            border: 2px solid #ff6600;
            border-radius: 10px;
            color: #fff;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            z-index: 1000;
            display: none;
        `;
        this.radiationHUD.innerHTML = `
            <div>
                <strong>☢️ РАДИАЦИЯ</strong>
                <div style="width: 100%; height: 20px; background: #331100; border-radius: 5px; margin-top: 5px; overflow: hidden;">
                    <div id="radiation-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #00ff00, #ffff00, #ff0000); transition: width 0.3s;"></div>
                </div>
                <div id="radiation-text" style="text-align: right; margin-top: 5px; font-size: 12px;">0%</div>
            </div>
        `;
        document.body.appendChild(this.radiationHUD);

        // Зарядка от звезды
        this.starChargeHUD = document.createElement('div');
        this.starChargeHUD.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            padding: 10px 15px;
            background: rgba(255, 100, 0, 0.8);
            border: 2px solid #ff6600;
            border-radius: 10px;
            color: #fff;
            font-family: 'Courier New', monospace;
            font-size: 16px;
            font-weight: bold;
            z-index: 1000;
            display: none;
        `;
        this.starChargeHUD.innerHTML = `⚡ +<span id="star-charge-rate">0</span> ед/сек`;
        document.body.appendChild(this.starChargeHUD);
    }

    // Создание оверлея мерцания ауры
    private createAuraOverlay() {
        this.auraPulseOverlay = document.createElement('div');
        this.auraPulseOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 999;
            background: radial-gradient(circle, transparent 50%, rgba(255, 100, 0, 0.3) 100%);
            opacity: 0;
        `;
        document.body.appendChild(this.auraPulseOverlay);
    }

    // Обновление HUD энергии
    private updateEnergyHUD() {
        if (!this.energyHUD || !this.waterHUD || !this.radiationHUD || !this.starChargeHUD) return;

        // Энергия
        const energyPercent = (this.energy / this.energyCapacity) * 100;
        const energyBar = document.getElementById('energy-bar');
        const energyText = document.getElementById('energy-text');
        if (energyBar) {
            energyBar.style.width = `${Math.max(0, energyPercent)}%`;
            energyBar.style.background = energyPercent > 50 
                ? 'linear-gradient(90deg, #00ff00, #88ff00)' 
                : energyPercent > 20 
                    ? 'linear-gradient(90deg, #ff8800, #ffcc00)'
                    : 'linear-gradient(90deg, #ff0000, #ff4400)';
        }
        if (energyText) {
            const energyK = (this.energyCapacity / 1000).toFixed(0) + 'k';
            energyText.textContent = `${Math.floor(this.energy)}/${energyK}`;
        }

        // Вода
        const waterPercent = (this.water / this.waterCapacity) * 100;
        const waterBar = document.getElementById('water-bar');
        const waterText = document.getElementById('water-text');
        if (waterBar) {
            waterBar.style.width = `${Math.max(0, waterPercent)}%`;
        }
        if (waterText) {
            waterText.textContent = `${Math.floor(this.water)}/${this.waterCapacity}`;
        }

        // Радиация (показываем только если > 0)
        if (this.radiation > 0) {
            this.radiationHUD.style.display = 'block';
            const radiationBar = document.getElementById('radiation-bar');
            const radiationText = document.getElementById('radiation-text');
            if (radiationBar) {
                radiationBar.style.width = `${Math.min(100, this.radiation)}%`;
            }
            if (radiationText) {
                radiationText.textContent = `${Math.floor(this.radiation)}%`;
            }
        } else {
            this.radiationHUD.style.display = 'none';
        }

        // Зарядка от звезды (показываем только если > 0)
        if (this.starChargeRate > 0) {
            this.starChargeHUD.style.display = 'block';
            const chargeRateEl = document.getElementById('star-charge-rate');
            if (chargeRateEl) {
                chargeRateEl.textContent = this.starChargeRate.toString();
            }
        } else {
            this.starChargeHUD.style.display = 'none';
        }
    }

    // Обновление мерцания ауры
    private updateAuraPulse(deltaTime: number) {
        if (!this.auraPulseOverlay) return;

        const distance = this.shipPosition.distanceTo(this.starPosition);
        
        if (distance < 100) {
            // В ауре - мерцание
            this.auraPulseAlpha += deltaTime * 3; // Скорость мерцания
            const alpha = 0.2 + 0.3 * Math.sin(this.auraPulseAlpha);
            this.auraPulseOverlay.style.opacity = alpha.toString();
            
            // Усиливаем эффект при низкой энергии
            if (this.energy < 200) {
                this.auraPulseOverlay.style.background = `radial-gradient(circle, transparent 40%, rgba(255, 200, 0, 0.5) 100%)`;
            } else {
                this.auraPulseOverlay.style.background = `radial-gradient(circle, transparent 50%, rgba(255, 100, 0, 0.3) 100%)`;
            }
        } else {
            // Вне ауры - плавно убираем
            const currentOpacity = parseFloat(this.auraPulseOverlay.style.opacity);
            if (currentOpacity > 0.01) {
                this.auraPulseOverlay.style.opacity = (currentOpacity - deltaTime * 2).toString();
            } else {
                this.auraPulseOverlay.style.opacity = '0';
            }
        }
    }

    private onKeyDown(event: KeyboardEvent) {
        const key = event.code;
        if (this.keysPressed.has(key)) return;
        this.keysPressed.add(key);

        switch (key) {
            // === ТЯГА ===
            case 'KeyA':
                this.increaseThrottle();
                break;
            case 'KeyZ':
                this.decreaseThrottle();
                break;

            // === ВРАЩЕНИЕ (стрелки) ===
            // Обрабатывается в update()

            // === ГРУЗОВОЙ ЛЮК ===
            case 'KeyO':
                this.toggleCargoBay();
                break;

            // === СПУТНИКИ ===
            case 'KeyK':
                this.deploySatellite();
                break;
            case 'KeyH':
                this.recallSatellites();
                break;

            // === ЛАЗЕР ===
            case 'ControlLeft':
            case 'ControlRight':
                this.laserFiring = true;
                break;

            // === СПЕЦИАЛЬНЫЕ СИСТЕМЫ ===
            case 'KeyN':
                this.toggleTacticalNav();
                break;
            case 'KeyI':
                this.showObjectInfo();
                break;
            case 'KeyT':
                this.showShipInfo();
                break;
            case 'KeyB':
                this.toggleDockingComputer();
                break;
            case 'KeyU':
                this.toggleAutopilot();
                break;
            case 'Backspace':
                this.zeroSpeed();
                break;
            case 'Tab':
                this.toggleTurbo();
                break;
            case 'KeyJ':
                if (event.shiftKey) {
                    this.toggleSETABoost();
                } else {
                    this.toggleSETA();
                }
                break;
            case 'KeyL':
                this.launchMissile();
                break;
            case 'KeyM':
                this.selectMissile();
                break;
        }
    }

    private onKeyUp(event: KeyboardEvent) {
        const key = event.code;
        this.keysPressed.delete(key);

        if (key === 'ControlLeft' || key === 'ControlRight') {
            this.laserFiring = false;
        }
    }

    // === Управление тягой ===

    private increaseThrottle() {
        this.throttle = Math.min(100, this.throttle + 10);
        console.log(`📈 Тяга: ${this.throttle}%`);
        this.notifyStatusUpdate();
    }

    private decreaseThrottle() {
        this.throttle = Math.max(0, this.throttle - 10);
        console.log(`📉 Тяга: ${this.throttle}%`);
        this.notifyStatusUpdate();
    }

    private zeroSpeed() {
        this.throttle = 0;
        this.speed = 0;
        this.velocity.set(0, 0, 0);
        console.log('🛑 Скорость сброшена');
        this.notifyStatusUpdate();
    }

    private toggleTurbo() {
        this.turboMode = !this.turboMode;
        console.log(`⚡ Турбо: ${this.turboMode ? 'ВКЛ' : 'ВЫКЛ'}`);
        this.notifyStatusUpdate();
    }

    private toggleSETA() {
        this.setaMode = !this.setaMode;
        console.log(`⏱️ S.E.T.A: ${this.setaMode ? 'ВКЛ' : 'ВЫКЛ'}`);
        this.notifyStatusUpdate();
    }

    private toggleSETABoost() {
        this.setaBoost = !this.setaBoost;
        console.log(`⏱️⚡ S.E.T.A Boost: ${this.setaBoost ? 'ВКЛ' : 'ВЫКЛ'}`);
        this.notifyStatusUpdate();
    }

    // === Грузовой люк ===

    private toggleCargoBay() {
        this.cargoBayOpen = !this.cargoBayOpen;
        console.log(`🚪 Грузовой люк: ${this.cargoBayOpen ? 'ОТКРЫТ' : 'ЗАКРЫТ'}`);
        
        // Если открыли люк - пробуем собрать nearby ресурсы
        if (this.cargoBayOpen) {
            this.collectNearbyResources();
        }
        
        this.notifyStatusUpdate();
    }

    // === Спутники ===

    private deploySatellite() {
        if (this.cargo.metal < 50) {
            console.log('❌ Недостаточно металла (нужно 50)');
            return;
        }

        this.cargo.metal -= 50;
        this.satellitesDeployed++;

        // Создаём визуализацию спутника
        const satelliteGeo = new THREE.OctahedronGeometry(3, 0);
        const satelliteMat = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            emissive: 0x004400,
            metalness: 0.8,
            roughness: 0.2
        });
        const satellite = new THREE.Mesh(satelliteGeo, satelliteMat);
        
        // Позиция рядом с кораблём
        const offset = new THREE.Vector3(20, 5, 0);
        offset.applyQuaternion(this.shipQuaternion);
        satellite.position.copy(this.shipPosition).add(offset);
        
        this.scene.add(satellite);
        this.satellites.push(satellite);

        console.log(`🛰️ Спутник развёрнут! Всего: ${this.satellitesDeployed}`);
        this.notifyStatusUpdate();
    }

    private recallSatellites() {
        if (this.satellites.length === 0) {
            console.log('ℹ️ Нет развёрнутых спутников');
            return;
        }

        // Возвращаем все спутники
        this.satellites.forEach(sat => {
            this.scene.remove(sat);
            sat.geometry.dispose();
            (sat.material as THREE.Material).dispose();
        });

        const count = this.satellites.length;
        this.satellites = [];
        this.satellitesDeployed = 0;

        // Возвращаем часть ресурсов
        this.cargo.metal += count * 25; // Возвращаем 50% металла

        console.log(`🛰️ Спутники отозваны: ${count} шт. Возвращено 25 металла за каждый`);
        this.notifyStatusUpdate();
    }

    // === Лазерная добыча ресурсов ===

    public fireLaserAtAsteroid(asteroid: THREE.Group, asteroidType: string): void {
        // Создаём частицу ресурса
        const particleType = this.getResourceTypeFromAsteroid(asteroidType);
        this.createResourceParticle(asteroid.position.clone(), particleType, asteroid.id);
    }

    private createResourceParticle(position: THREE.Vector3, type: 'metal' | 'silicon' | 'ice' | 'rare', asteroidId: number) {
        const particleGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        
        let color: number;
        switch(type) {
            case 'silicon': color = 0x66aaff; break;
            case 'ice': color = 0xaaddff; break;
            case 'rare': color = 0xffaa44; break;
            default: color = 0x888888;
        }

        const particleMat = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.3,
            metalness: 0.5,
            roughness: 0.7
        });

        const particle = new THREE.Mesh(particleGeo, particleMat);
        
        // Случайная позиция вокруг астероида
        const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 30,
            (Math.random() - 0.5) * 30,
            (Math.random() - 0.5) * 30
        );
        particle.position.copy(position).add(offset);

        // Случайная скорость вращения вокруг астероида
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10
        );

        this.scene.add(particle);

        const particleData: ResourceParticle = {
            id: this.nextParticleId++,
            mesh: particle,
            type: type,
            velocity: velocity,
            asteroidId: asteroidId,
            isCollected: false
        };

        this.resourceParticles.push(particleData);
        console.log(`✨ Создана частица ресурса: ${type}`);
    }

    private updateResourceParticles(deltaTime: number) {
        for (let i = this.resourceParticles.length - 1; i >= 0; i--) {
            const particle = this.resourceParticles[i];

            if (particle.isCollected) continue;

            // Вращение вокруг астероида (или свободный полёт если астероид уничтожен)
            if (particle.asteroidId !== null) {
                // Орбитальное движение
                const orbitSpeed = 2 * deltaTime;
                const orbitAxis = new THREE.Vector3(
                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5
                ).normalize();

                const rotationMatrix = new THREE.Matrix4().makeRotationAxis(orbitAxis, orbitSpeed);
                particle.velocity.applyMatrix4(rotationMatrix);
            }

            // Обновление позиции
            particle.mesh.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
            particle.mesh.rotation.x += deltaTime;
            particle.mesh.rotation.y += deltaTime;

            // Проверка сбора при открытом люке
            if (this.cargoBayOpen) {
                const distance = particle.mesh.position.distanceTo(this.shipPosition);
                if (distance < this.collectionDistance) {
                    this.collectResource(particle, i);
                }
            }
        }
    }

    // Обновление вокселей ресурсов
    private updateResourceVoxels(deltaTime: number) {
        for (let i = this.resourceVoxels.length - 1; i >= 0; i--) {
            const voxel = this.resourceVoxels[i];

            if (voxel.isCollected) continue;

            // Обновление позиции
            voxel.mesh.position.add(voxel.velocity.clone().multiplyScalar(deltaTime));
            voxel.mesh.rotation.x += voxel.rotationSpeed.x * deltaTime;
            voxel.mesh.rotation.y += voxel.rotationSpeed.y * deltaTime;
            voxel.mesh.rotation.z += voxel.rotationSpeed.z * deltaTime;

            // Проверка сбора при открытом люке
            if (this.cargoBayOpen) {
                const distance = voxel.mesh.position.distanceTo(this.shipPosition);
                if (distance < this.collectionDistance) {
                    this.collectVoxel(voxel, i);
                }
            }

            // Проверка столкновения с кораблём
            const shipDistance = voxel.mesh.position.distanceTo(this.shipPosition);
            if (shipDistance < 5 && !this.collisionCooldown) {
                // Столкновение с вокселем!
                this.handleVoxelCollision(voxel);
            }
        }
    }

    private collectVoxel(voxel: ResourceVoxel, index: number) {
        // Добавляем ресурс в груз
        switch (voxel.type) {
            case 'metal': this.cargo.metal += 10; break;
            case 'silicon': this.cargo.silicon += 8; break;
            case 'ice': this.cargo.ice += 12; break;
            case 'rare': this.cargo.rare += 3; break;
        }

        // Удаляем воксель
        this.scene.remove(voxel.mesh);
        voxel.mesh.geometry.dispose();
        (voxel.mesh.material as THREE.Material).dispose();

        this.resourceVoxels.splice(index, 1);

        console.log(`📦 Получен ресурс: ${voxel.type}`);
        this.notifyStatusUpdate();
    }

    private handleVoxelCollision(voxel: ResourceVoxel) {
        // Столкновение с вокселем - урон щитам и торможение
        this.shields = Math.max(0, this.shields - 5);
        this.velocity.multiplyScalar(0.5);  // Теряем 50% скорости

        // Удаляем воксель
        this.scene.remove(voxel.mesh);
        voxel.mesh.geometry.dispose();
        (voxel.mesh.material as THREE.Material).dispose();

        const index = this.resourceVoxels.indexOf(voxel);
        if (index > -1) {
            this.resourceVoxels.splice(index, 1);
        }

        console.log(`💥 Столкновение с вокселем! Щиты: ${this.shields}%`);
        this.notifyStatusUpdate();
    }

    private collectResource(particle: ResourceParticle, index: number) {
        // Добавляем ресурс в груз
        switch(particle.type) {
            case 'metal': this.cargo.metal += 10; break;
            case 'silicon': this.cargo.silicon += 8; break;
            case 'ice': this.cargo.ice += 12; break;
            case 'rare': this.cargo.rare += 3; break;
        }

        // Удаляем частицу
        this.scene.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        (particle.mesh.material as THREE.Material).dispose();

        this.resourceParticles.splice(index, 1);

        console.log(`📦 Получен ресурс: ${particle.type} (+${particle.type === 'metal' ? 10 : particle.type === 'silicon' ? 8 : particle.type === 'ice' ? 12 : 3})`);
        this.notifyStatusUpdate();
    }

    private collectNearbyResources() {
        // Собираем все частицы в радиусе при открытии люка
        for (let i = this.resourceParticles.length - 1; i >= 0; i--) {
            const particle = this.resourceParticles[i];
            if (!particle.isCollected) {
                const distance = particle.mesh.position.distanceTo(this.shipPosition);
                if (distance < this.collectionDistance * 1.5) {
                    this.collectResource(particle, i);
                }
            }
        }
    }

    // === Остальные методы ===

    private toggleTacticalNav() {
        this.tacticalNavActive = !this.tacticalNavActive;
        console.log(`🗺️ Tactical Navigation: ${this.tacticalNavActive ? 'ВКЛ' : 'ВЫКЛ'}`);
    }

    private showObjectInfo() {
        if (!this.hoveredObject) {
            // Если ничего не под мышью, ищем ближайший объект
            this.showNearestObjectInfo();
            return;
        }

        const obj = this.hoveredObject;
        const distance = this.shipPosition.distanceTo(obj.position);

        // Звезда (проверяем имя и userData)
        if (obj.name === 'star' || obj.userData?.isStar) {
            this.showStarInfo(distance);
            return;
        }

        // Астероид
        if (obj.userData?.type === 'metallic' || 
            obj.userData?.type === 'silicon' || 
            obj.userData?.type === 'icy' || 
            obj.userData?.type === 'rare') {
            const type = obj.userData?.type || 'Неизвестно';
            const typeName = this.getAsteroidTypeName(type);
            
            let info = `ℹ️ АСТЕРОИД\n\n`;
            info += `🪨 Тип: ${typeName}\n`;
            info += `📏 Дистанция: ${distance.toFixed(0)} м\n`;
            info += `📍 Координаты: (${obj.position.x.toFixed(0)}, ${obj.position.y.toFixed(0)}, ${obj.position.z.toFixed(0)})\n`;
            info += `\n📦 Ресурсы:\n`;
            info += this.getResourceInfo(type);
            
            // Секретные события (будущая реализация)
            if (distance < 100) {
                info += `\n⚠️ ВНИМАНИЕ: Близкое расстояние!\n`;
            }
            
            this.showInfoDialog(info);
            return;
        }

        // Станция
        if (obj.userData?.isStation) {
            const stationName = obj.userData?.stationName || 'Неизвестная';
            const stationOwner = obj.userData?.owner || 'Ничья';
            
            let info = `🏪 СТАНЦИЯ\n\n`;
            info += `📛 Название: ${stationName}\n`;
            info += `👤 Владелец: ${stationOwner}\n`;
            info += `📏 Дистанция: ${distance.toFixed(0)} м\n`;
            info += `📍 Координаты: (${obj.position.x.toFixed(0)}, ${obj.position.y.toFixed(0)}, ${obj.position.z.toFixed(0)})\n`;
            info += `\n🔧 Услуги:\n`;
            info += `💧 Пополнение воды\n`;
            info += `⚡ Зарядка от звезды\n`;
            info += `🚀 Производство ракет\n`;
            
            this.showInfoDialog(info);
            return;
        }

        // Неизвестный объект
        this.showInfoDialog(`ℹ️ НЕИЗВЕСТНЫЙ ОБЪЕКТ\n\nТип: ${obj.type || 'N/A'}\nДистанция: ${distance.toFixed(0)} м`);
    }

    // Показ информации о ближайшем объекте (если мышь не на объекте)
    private showNearestObjectInfo() {
        let nearest: THREE.Object3D | null = null;
        let minDistance = Infinity;
        let type = 'unknown';

        // Ищем астероиды
        for (const asteroid of this.asteroids) {
            const distance = asteroid.position.distanceTo(this.shipPosition);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = asteroid;
                type = asteroid.userData?.type || 'asteroid';
            }
        }

        if (nearest && minDistance < 1000) {
            const typeName = this.getAsteroidTypeName(type);
            let info = `ℹ️ БЛИЖАЙШИЙ ОБЪЕКТ\n\n`;
            info += `🪨 Тип: ${typeName}\n`;
            info += `📏 Дистанция: ${minDistance.toFixed(0)} м\n`;
            info += `\n💡 Подсказка: Наведите мышь на объект для подробной информации`;
            this.showInfoDialog(info);
        } else {
            this.showInfoDialog(`ℹ️ ОБЪЕКТЫ НЕ ОБНАРУЖЕНЫ\n\n💡 Подсказка: Наведите мышь на звезду, астероид или станцию`);
        }
    }

    // Информация о звезде
    private showStarInfo(distance: number) {
        const starPos = new THREE.Vector3(0, 0, 0);
        const starDistance = this.shipPosition.distanceTo(starPos);

        // Определяем зону
        let zone = 'КОСМОС';
        let chargeRate = 0;
        let radiation = 0;
        let dangerLevel = 'БЕЗОПАСНО';

        if (starDistance < 50) {
            zone = 'СМЕРТЕЛЬНАЯ ЗОНА';
            chargeRate = 100;
            radiation = 10;
            dangerLevel = 'КРИТИЧЕСКИ!';
        } else if (starDistance < 100) {
            zone = 'АУРА ЗВЕЗДЫ';
            chargeRate = 100;
            radiation = 5;
            dangerLevel = 'ОПАСНО';
        } else if (starDistance < 300) {
            zone = 'СРЕДНЯЯ ЗОНА';
            chargeRate = 30;
            radiation = 2;
            dangerLevel = 'ОТНОСИТЕЛЬНО';
        } else if (starDistance < 1000) {
            zone = 'ДАЛЬНЯЯ ЗОНА';
            chargeRate = 5;
            radiation = 0;
            dangerLevel = 'БЕЗОПАСНО';
        }

        let info = `☀️ ЗВЕЗДА\n\n`;
        info += `📏 Дистанция: ${starDistance.toFixed(0)} м\n`;
        info += `🌍 Зона: ${zone}\n`;
        info += `⚡ Зарядка: +${chargeRate} ед/сек\n`;
        info += `☢️ Радиация: +${radiation}%/сек\n`;
        info += `⚠️ Опасность: ${dangerLevel}\n`;
        info += `\n📊 Параметры:\n`;
        info += `Температура: ${zone === 'АУРА ЗВЕЗДЫ' ? '1000K' : '300K'}\n`;
        info += `Гравитация: ${starDistance < 100 ? 'ВЫСОКАЯ' : 'НОРМАЛЬНАЯ'}\n`;
        
        // Секретные события (задел на будущее)
        info += `\n🔮 СЕКРЕТНЫЕ СОБЫТИЯ:\n`;
        info += `✳️ Артефакты: ${this.checkArtifactsNearby() ? 'ОБНАРУЖЕНЫ!' : 'Не обнаружено'}\n`;
        info += `🌌 Аномалии: ${this.checkAnomaliesNearby() ? 'Зафиксированы!' : 'Нет данных'}\n`;
        info += `📡 Сигналы: ${this.checkSignalsNearby() ? 'Получен сигнал!' : 'Тишина'}\n`;
        
        info += `\n💡 Совет: Избегайте сближения < 50м!`;
        
        this.showInfoDialog(info);
    }

    // Проверка артефактов (заглушка для будущей реализации)
    private checkArtifactsNearby(): boolean {
        // Будущая реализация: проверка сценариев
        return Math.random() < 0.1; // 10% шанс для демонстрации
    }

    // Проверка аномалий (заглушка)
    private checkAnomaliesNearby(): boolean {
        return Math.random() < 0.15;
    }

    // Проверка сигналов (заглушка)
    private checkSignalsNearby(): boolean {
        return Math.random() < 0.2;
    }

    // Получение информации о ресурсах
    private getResourceInfo(type: string): string {
        switch (type) {
            case 'metallic': return '⚙️ Металл: 10 ед/воксель\n';
            case 'silicon': return '💎 Кремний: 8 ед/воксель\n';
            case 'icy': return '❄️ Лёд: 12 ед/воксель\n💧 Вода: 5 ед/лёд\n';
            case 'rare': return '🌟 Редкие: 3 ед/воксель\n';
            default: return 'Неизвестно\n';
        }
    }

    // Получение названия типа астероида
    private getAsteroidTypeName(type: string): string {
        switch (type) {
            case 'metallic': return 'Металлический';
            case 'silicon': return 'Кремниевый';
            case 'icy': return 'Ледяной';
            case 'rare': return 'Редкий';
            default: return 'Неизвестный';
        }
    }

    // Показ информационного диалога
    private showInfoDialog(content: string) {
        // Создаём стильное информационное окно
        const infoEl = document.createElement('div');
        infoEl.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, rgba(0, 20, 40, 0.95) 0%, rgba(0, 40, 80, 0.95) 100%);
            border: 2px solid #4488ff;
            border-radius: 15px;
            padding: 25px;
            color: #fff;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.6;
            z-index: 10000;
            min-width: 350px;
            max-width: 500px;
            box-shadow: 0 0 30px rgba(68, 136, 255, 0.5);
            white-space: pre-line;
        `;
        infoEl.innerHTML = content;

        // Кнопка закрытия
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕ Закрыть';
        closeBtn.style.cssText = `
            margin-top: 15px;
            padding: 8px 20px;
            background: #4488ff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            font-family: 'Courier New', monospace;
        `;
        closeBtn.onclick = () => infoEl.remove();
        infoEl.appendChild(closeBtn);

        // Закрытие по ESC
        const escHandler = (e: KeyboardEvent) => {
            if (e.code === 'Escape') {
                infoEl.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        document.body.appendChild(infoEl);
    }

    private showShipInfo() {
        // Показываем паузу меню с полной информацией
        this.showPauseMenu();
    }

    // Показ пауза меню
    private showPauseMenu() {
        const totalResources = this.cargo.metal + this.cargo.silicon + this.cargo.ice + this.cargo.rare;
        const stationsCount = 0; // Будет передаваться из main.ts

        const menuEl = document.createElement('div');
        menuEl.id = 'pause-menu';
        menuEl.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            z-index: 10001;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        menuEl.innerHTML = `
            <div style="
                background: linear-gradient(135deg, rgba(0, 20, 40, 0.95) 0%, rgba(0, 40, 80, 0.95) 100%);
                border: 3px solid #4488ff;
                border-radius: 20px;
                padding: 30px;
                color: #fff;
                font-family: 'Courier New', monospace;
                font-size: 14px;
                min-width: 500px;
                max-width: 700px;
                box-shadow: 0 0 50px rgba(68, 136, 255, 0.5);
            ">
                <h1 style="color: #4488ff; font-size: 28px; margin-bottom: 20px; text-align: center;">🚀 PAUSE</h1>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div style="background: rgba(0, 50, 100, 0.5); padding: 15px; border-radius: 10px; border: 1px solid #4488ff;">
                        <h2 style="color: #44aaff; margin-bottom: 10px; font-size: 16px;">👤 ИГРОК</h2>
                        <div>Имя: <span style="color: #fff;">Player</span></div>
                        <div>Станций: <span style="color: #fff;">${stationsCount}</span></div>
                        <div>Ранг: <span style="color: #ffaa00;">Новичок</span></div>
                    </div>
                    
                    <div style="background: rgba(0, 50, 100, 0.5); padding: 15px; border-radius: 10px; border: 1px solid #4488ff;">
                        <h2 style="color: #44aaff; margin-bottom: 10px; font-size: 16px;">🚀 КОРАБЛЬ</h2>
                        <div>Название: <span style="color: #fff;">Pioneer</span></div>
                        <div>Щиты: <span style="color: #00ff00;">${this.shields}%</span></div>
                        <div>Энергия: <span style="color: #ffaa00;">${Math.floor(this.energy)}/${this.energyCapacity}</span></div>
                    </div>
                </div>
                
                <div style="background: rgba(0, 50, 100, 0.5); padding: 15px; border-radius: 10px; border: 1px solid #4488ff; margin-bottom: 20px;">
                    <h2 style="color: #44aaff; margin-bottom: 10px; font-size: 16px;">📦 РЕСУРСЫ</h2>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>⚙️ Металл: <span style="color: #888;">${this.cargo.metal}</span></div>
                        <div>💎 Кремний: <span style="color: #66aaff;">${this.cargo.silicon}</span></div>
                        <div>❄️ Лёд: <span style="color: #aaddff;">${this.cargo.ice}</span></div>
                        <div>🌟 Редкие: <span style="color: #ffaa44;">${this.cargo.rare}</span></div>
                    </div>
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #444;">
                        📦 Всего: <span style="color: #00ff00; font-size: 18px;">${totalResources}</span> ед.
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <button id="ship-select-btn" style="
                        padding: 12px 20px;
                        background: #4488ff;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: bold;
                        font-family: 'Courier New', monospace;
                        font-size: 14px;
                    ">🚀 Выбор корабля</button>
                    
                    <button id="station-select-btn" style="
                        padding: 12px 20px;
                        background: #44aa66;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: bold;
                        font-family: 'Courier New', monospace;
                        font-size: 14px;
                    ">🏪 Выбор станции</button>
                </div>
                
                <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 2px solid #4488ff;">
                    <button id="resume-btn" style="
                        padding: 15px 40px;
                        background: #4488ff;
                        color: white;
                        border: none;
                        border-radius: 10px;
                        cursor: pointer;
                        font-weight: bold;
                        font-family: 'Courier New', monospace;
                        font-size: 16px;
                    ">⏯️ ПРОДОЛЖИТЬ</button>
                </div>
            </div>
        `;

        document.body.appendChild(menuEl);

        // Обработчики кнопок - вешаем после добавления в DOM
        setTimeout(() => {
            const resumeBtn = document.getElementById('resume-btn');
            const shipBtn = document.getElementById('ship-select-btn');
            const stationBtn = document.getElementById('station-select-btn');
            
            if (resumeBtn) {
                resumeBtn.addEventListener('click', () => {
                    menuEl.remove();
                });
            }
            if (shipBtn) {
                shipBtn.addEventListener('click', () => {
                    alert('🚀 Выбор корабля: В разработке');
                });
            }
            if (stationBtn) {
                stationBtn.addEventListener('click', () => {
                    alert('🏪 Выбор станции: В разработке');
                });
            }
        }, 0);

        // Закрытие по ESC
        const escHandler = (e: KeyboardEvent) => {
            if (e.code === 'Escape') {
                menuEl.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    private getTotalCargo(): number {
        return this.cargo.metal + this.cargo.silicon + this.cargo.ice + this.cargo.rare;
    }

    private toggleDockingComputer() {
        this.dockingComputerActive = !this.dockingComputerActive;
        console.log(`🔗 Стыковочный компьютер: ${this.dockingComputerActive ? 'ВКЛ' : 'ВЫКЛ'}`);
    }

    private toggleAutopilot() {
        this.autopilotActive = !this.autopilotActive;
        console.log(`🤖 Автопилот: ${this.autopilotActive ? 'ВКЛ' : 'ВЫКЛ'}`);
    }

    private fireLaser() {
        if (this.laserCooldown) return;

        this.laserActive = true;
        this.laserCooldown = true;

        setTimeout(() => {
            this.laserCooldown = false;
        }, this.laserFireRate * 1000);

        // Направление лазера из центра камеры
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = raycaster.intersectObjects(this.scene.children, true);

        let hitPoint: THREE.Vector3 | null = null;
        let hitAsteroid: THREE.Group | null = null;

        if (intersects.length > 0) {
            hitPoint = intersects[0].point.clone();
            const hitObject = intersects[0].object;

            // Проверяем, астероид ли это
            let parent = hitObject;
            while (parent && !parent.userData?.type) {
                parent = parent.parent as THREE.Object3D;
            }

            if (parent && parent.userData?.type) {
                hitAsteroid = parent as THREE.Group;
            }
        }

        // Обновляем левый лазер
        if (this.laserBeamLeft && hitPoint) {
            const leftOrigin = this.shipPosition.clone()
                .add(this.shipRight.clone().multiplyScalar(-3))
                .add(new THREE.Vector3(0, -1, 0));
            const positions = this.laserBeamLeft.geometry.attributes.position.array as Float32Array;
            positions[0] = leftOrigin.x;
            positions[1] = leftOrigin.y;
            positions[2] = leftOrigin.z;
            positions[3] = hitPoint.x;
            positions[4] = hitPoint.y;
            positions[5] = hitPoint.z;
            this.laserBeamLeft.geometry.attributes.position.needsUpdate = true;
            this.laserBeamLeft.visible = true;
        }

        // Обновляем правый лазер
        if (this.laserBeamRight && hitPoint) {
            const rightOrigin = this.shipPosition.clone()
                .add(this.shipRight.clone().multiplyScalar(3))
                .add(new THREE.Vector3(0, -1, 0));
            const positions = this.laserBeamRight.geometry.attributes.position.array as Float32Array;
            positions[0] = rightOrigin.x;
            positions[1] = rightOrigin.y;
            positions[2] = rightOrigin.z;
            positions[3] = hitPoint.x;
            positions[4] = hitPoint.y;
            positions[5] = hitPoint.z;
            this.laserBeamRight.geometry.attributes.position.needsUpdate = true;
            this.laserBeamRight.visible = true;
        }

        // Визуализация попадания
        if (hitPoint && this.laserHitSphere) {
            this.laserHitSphere.position.copy(hitPoint);
            this.laserHitSphere.visible = true;

            let scale = 1;
            const pulseInterval = setInterval(() => {
                scale += 0.2;
                this.laserHitSphere!.scale.setScalar(scale);
                if (scale > 3) {
                    clearInterval(pulseInterval);
                    this.laserHitSphere!.visible = false;
                    this.laserHitSphere!.scale.setScalar(1);
                }
            }, 50);

            // Создаём воксели ресурсов при попадании в астероид
            if (hitAsteroid) {
                this.createResourceVoxels(hitAsteroid, hitPoint);
            }
        }

        // Скрываем лучи через 150мс
        setTimeout(() => {
            if (this.laserBeamLeft) this.laserBeamLeft.visible = false;
            if (this.laserBeamRight) this.laserBeamRight.visible = false;
            if (this.laserHitSphere) this.laserHitSphere.visible = false;
            this.laserActive = false;
            this.notifyStatusUpdate();
        }, 150);

        this.notifyStatusUpdate();
    }

    // Создание вокселей ресурсов при попадании в астероид
    private createResourceVoxels(asteroid: THREE.Group, hitPoint: THREE.Vector3) {
        const asteroidType = asteroid.userData?.type || 'metallic';
        const resourceType = this.getResourceTypeFromAsteroid(asteroidType);

        // Количество вокселей зависит от типа астероида
        let voxelCount = 1;
        switch (asteroidType) {
            case 'rare': voxelCount = 3; break;
            case 'silicon': voxelCount = 2; break;
            case 'icy': voxelCount = 2; break;
        }

        // Создаём воксели
        for (let i = 0; i < voxelCount; i++) {
            this.createSingleVoxel(hitPoint, resourceType, asteroid.id);
        }
    }

    private createSingleVoxel(position: THREE.Vector3, type: 'metal' | 'silicon' | 'ice' | 'rare', asteroidId: number) {
        const voxelGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);

        let color: number;
        switch (type) {
            case 'silicon': color = 0x66aaff; break;
            case 'ice': color = 0xaaddff; break;
            case 'rare': color = 0xffaa44; break;
            default: color = 0x888888;
        }

        const voxelMat = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.3,
            metalness: 0.5,
            roughness: 0.7
        });

        const voxel = new THREE.Mesh(voxelGeo, voxelMat);

        // Случайное смещение от точки попадания
        const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5
        );
        voxel.position.copy(position).add(offset);

        // Случайная скорость разлёта
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20
        );

        // Случайная скорость вращения
        const rotationSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 5
        );

        this.scene.add(voxel);

        const voxelData: ResourceVoxel = {
            id: this.nextVoxelId++,
            mesh: voxel,
            type: type,
            velocity: velocity,
            rotationSpeed: rotationSpeed,
            asteroidId: asteroidId,
            isCollected: false
        };

        this.resourceVoxels.push(voxelData);
    }

    private getResourceTypeFromAsteroid(asteroidType: string): 'metal' | 'silicon' | 'ice' | 'rare' {
        switch (asteroidType) {
            case 'silicon': return 'silicon';
            case 'icy': return 'ice';
            case 'rare': return 'rare';
            default: return 'metal';
        }
    }

    private launchMissile() {
        alert(`🚀 Ракета запущена: ${this.currentMissile}`);
    }

    private selectMissile() {
        const missiles = ['None', 'Hammerhead', 'Firestorm', 'Tempest'];
        const idx = missiles.indexOf(this.currentMissile);
        this.currentMissile = missiles[(idx + 1) % missiles.length];
        console.log(`🎯 Ракета: ${this.currentMissile}`);
        this.notifyStatusUpdate();
    }

    // Заглушки
    private tacticalNavActive = false;
    private dockingComputerActive = false;
    private autopilotActive = false;

    // === Проверка столкновений ===

    private checkCollisions(): boolean {
        const rayLength = 10;
        const raycaster = new THREE.Raycaster(
            this.shipPosition,
            this.velocity.clone().normalize(),
            0,
            rayLength
        );

        const intersectableObjects = this.scene.children.filter(child =>
            child !== this.laserBeamLeft &&
            child !== this.laserBeamRight &&
            child !== this.laserHitSphere
        );

        const intersects = raycaster.intersectObjects(intersectableObjects, true);

        if (intersects.length > 0) {
            const hitObject = intersects[0].object;

            if (hitObject.name === 'star' || hitObject.parent?.name === 'star') {
                console.log('💥 Столкновение со звездой!');
                return true;
            }

            if (hitObject.userData?.type) {
                console.log('💥 Столкновение с астероидом!');
                return true;
            }

            if (hitObject.parent?.userData?.isStation) {
                console.log('💥 Столкновение со станцией!');
                return true;
            }

            return true;
        }

        return false;
    }

    private handleCollision() {
        this.velocity.set(0, 0, 0);
        this.speed = 0;
        this.shields = Math.max(0, this.shields - 10);

        console.log(`💥 Столкновение! Щиты: ${this.shields}%`);

        if (this.shields <= 0) {
            console.log('☠️ Корабль уничтожен! Респавн...');
            this.respawn();
        }

        this.collisionCooldown = true;
        setTimeout(() => {
            this.collisionCooldown = false;
        }, 1000);
    }

    private respawn() {
        this.shipPosition.set(500, 0, 0);
        this.velocity.set(0, 0, 0);
        this.throttle = 0;
        this.speed = 0;
        this.shields = 100;

        // Сбрасываем вращение корабля
        this.ship.quaternion.identity();
        this.ship.position.copy(this.shipPosition);

        // Поворачиваем корабль носом вниз к звезде
        this.ship.rotateX(Math.PI / 2);

        // Обновляем локальные векторы
        this.shipForward.set(0, 0, -1).applyQuaternion(this.ship.quaternion);
        this.shipRight.set(1, 0, 0).applyQuaternion(this.ship.quaternion);
        this.shipUp.set(0, 1, 0).applyQuaternion(this.ship.quaternion);

        console.log('✅ Респавн completed! Щиты восстановлены.');
        this.notifyStatusUpdate();
    }

    // Проверка столкновений с астероидами
    private checkAsteroidCollisions() {
        const rayLength = 15;  // Дистанция проверки
        const raycaster = new THREE.Raycaster(
            this.shipPosition,
            this.shipForward.clone().normalize(),  // Направление носа корабля
            0,
            rayLength
        );

        // Ищем только астероиды
        const asteroids = this.scene.children.filter(child =>
            child.userData?.type && child.type === 'Group'
        );

        const intersects = raycaster.intersectObjects(asteroids, true);

        if (intersects.length > 0) {
            const distance = intersects[0].distance;
            
            // Если очень близко - столкновение!
            if (distance < 10) {
                this.handleAsteroidCollision();
            }
        }
    }

    private handleAsteroidCollision() {
        // Столкновение с астероидом - серьёзный урон и полная остановка
        this.velocity.set(0, 0, 0);
        this.speed = 0;
        this.throttle = 0;
        this.shields = Math.max(0, this.shields - 15);

        console.log(`💥 Столкновение с астероидом! Щиты: ${this.shields}%`);

        // Корабль отскакивает
        const bounceDirection = this.shipForward.clone().negate();
        this.velocity.copy(bounceDirection.multiplyScalar(20));

        if (this.shields <= 0) {
            console.log('☠️ Корабль уничтожен! Респавн...');
            this.respawn();
        }

        this.collisionCooldown = true;
        setTimeout(() => {
            this.collisionCooldown = false;
        }, 1000);

        this.notifyStatusUpdate();
    }

    // === Обновление физики ===

    public update(deltaTime: number) {
        // 1. Вращение корабля через локальные оси (чистая математика)
        const rotationSpeed = 2.5 * deltaTime;

        // Определяем локальные оси из текущего кватерниона корабля
        const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(this.ship.quaternion);
        const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(this.ship.quaternion);

        // ↑ / ↓ - тангаж (pitch) вокруг локальной оси X (через крылья)
        if (this.keysPressed.has('ArrowUp')) {
            const q = new THREE.Quaternion().setFromAxisAngle(localX, rotationSpeed);
            this.ship.quaternion.premultiply(q);
        }
        if (this.keysPressed.has('ArrowDown')) {
            const q = new THREE.Quaternion().setFromAxisAngle(localX, -rotationSpeed);
            this.ship.quaternion.premultiply(q);
        }

        // ← / → - рыскание (yaw) вокруг локальной оси Y (вертикальная)
        if (this.keysPressed.has('ArrowLeft')) {
            const q = new THREE.Quaternion().setFromAxisAngle(localY, rotationSpeed);
            this.ship.quaternion.premultiply(q);
        }
        if (this.keysPressed.has('ArrowRight')) {
            const q = new THREE.Quaternion().setFromAxisAngle(localY, -rotationSpeed);
            this.ship.quaternion.premultiply(q);
        }

        // Нормализуем кватернион (предотвращаем дрейф)
        this.ship.quaternion.normalize();

        // 2. Обновляем локальные векторы из матрицы корабля
        this.shipQuaternion.copy(this.ship.quaternion);
        this.shipForward.set(0, 0, -1).applyQuaternion(this.shipQuaternion);
        this.shipRight.set(1, 0, 0).applyQuaternion(this.shipQuaternion);
        this.shipUp.set(0, 1, 0).applyQuaternion(this.shipQuaternion);

        // 3. Вычисляем скорость с учётом модификаторов
        let currentMaxSpeed = this.maxSpeed;
        if (this.turboMode) currentMaxSpeed *= 2;
        if (this.setaMode) currentMaxSpeed *= 5;
        if (this.setaBoost) currentMaxSpeed *= 10;

        this.speed = (this.throttle / 100) * currentMaxSpeed;

        // 4. Движение в направлении носа
        const moveDistance = this.speed * deltaTime;
        this.shipPosition.add(this.shipForward.clone().multiplyScalar(moveDistance));

        // 5. Обновляем позицию корабля (камера обновится автоматически через matrixWorld)
        this.ship.position.copy(this.shipPosition);

        // 6. Проверка столкновений
        if (!this.collisionCooldown) {
            if (this.checkCollisions()) {
                this.handleCollision();
            }
        }

        // 7. Стрельба из лазера
        if (this.laserFiring) {
            this.fireLaser();
        }

        // 8. Обновление частиц ресурсов и вокселей
        this.updateResourceParticles(deltaTime);
        this.updateResourceVoxels(deltaTime);

        // 9. Обновление энергии и радиации от звезды
        this.updateStarInteraction(deltaTime);

        // 10. Расход ресурсов (двигатели, лазер)
        this.consumeResources(deltaTime);

        // 11. Проверка столкновений с астероидами
        if (!this.collisionCooldown) {
            this.checkAsteroidCollisions();
        }

        // 12. Обновление спутников (орбита вокруг корабля)
        this.updateSatellites(deltaTime);

        // 13. Обновление HUD энергии и мерцания ауры
        this.updateEnergyHUD();
        this.updateAuraPulse(deltaTime);

        // 14. Обновление маркера выделения
        this.updateSelectionMarker();

        // 15. Автонаведение на выделенный объект
        this.handleAutoTargeting(deltaTime);

        // 10. Принудительно копируем позицию и вращение корабля на камеру
        // Камера должна быть "тупой" - никаких lookAt, никаких up.set()
        this.camera.position.copy(this.ship.position);
        this.camera.quaternion.copy(this.ship.quaternion);

        // 11. Обновляем HUD
        this.notifyStatusUpdate();
    }

    // Обновление энергии и радиации от звезды
    private updateStarInteraction(deltaTime: number) {
        const distance = this.shipPosition.distanceTo(this.starPosition);

        // Определяем зону звезды
        let chargeRate = 0;
        let radiationGain = 0;

        if (distance < 100) {
            // В ауре (максимальная зарядка)
            chargeRate = 100;
            radiationGain = 5;
        } else if (distance < 300) {
            // Средняя зона
            chargeRate = 30;
            radiationGain = 2;
        } else if (distance < 1000) {
            // Дальняя зона
            chargeRate = 5;
            radiationGain = 0;
        }

        // Зарядка энергии
        this.energy = Math.min(this.energyCapacity, this.energy + chargeRate * deltaTime);
        this.starChargeRate = chargeRate;

        // Радиация
        this.radiation = Math.min(100, this.radiation + radiationGain * deltaTime);

        // Проверка столкновения со звездой
        if (distance < 50) {
            this.handleStarCollision();
        }
    }

    // Столкновение со звездой (ПОЛНЫЙ КОНЕЦ ИГРЫ)
    private handleStarCollision() {
        console.log('☀️💥 СТОЛКНОВЕНИЕ СО ЗВЕЗДОЙ! ИГРА ОКОНЧЕНА!');
        
        // Показываем статистику
        this.showGameOverStats();
        
        // Закрываем игру (возвращаем на экран входа)
        setTimeout(() => {
            this.returnToMainMenu();
        }, 3000);
    }

    // Показ статистики в конце игры
    private showGameOverStats() {
        const totalResources = this.cargo.metal + this.cargo.silicon + this.cargo.ice + this.cargo.rare;
        
        const statsEl = document.createElement('div');
        statsEl.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            border: 3px solid #ff4400;
            border-radius: 20px;
            padding: 40px;
            color: #fff;
            font-family: 'Courier New', monospace;
            font-size: 18px;
            text-align: center;
            z-index: 9999;
        `;
        
        statsEl.innerHTML = `
            <h1 style="color: #ff4400; font-size: 36px; margin-bottom: 20px;">☀️ СГОРЕЛ В ЗВЕЗДЕ!</h1>
            <div style="margin: 20px 0;">
                <h2>📊 СТАТИСТИКА МИССИИ</h2>
                <p>⚙️ Металл: <span style="color: #888;">${this.cargo.metal}</span></p>
                <p>💎 Кремний: <span style="color: #66aaff;">${this.cargo.silicon}</span></p>
                <p>❄️ Лёд: <span style="color: #aaddff;">${this.cargo.ice}</span></p>
                <p>🌟 Редкие: <span style="color: #ffaa44;">${this.cargo.rare}</span></p>
                <hr style="border-color: #444; margin: 15px 0;">
                <p style="font-size: 24px;">📦 Всего ресурсов: <span style="color: #00ff00;">${totalResources}</span></p>
            </div>
            <p style="color: #888; font-size: 14px;">Возврат в меню через 3 секунды...</p>
        `;
        
        document.body.appendChild(statsEl);
    }

    // Возврат на экран входа
    private returnToMainMenu() {
        // Очищаем сцену
        this.scene.clear();
        
        // Показываем экран входа
        const mainMenuEl = document.createElement('div');
        mainMenuEl.id = 'main-menu';
        mainMenuEl.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 100%);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;
        
        mainMenuEl.innerHTML = `
            <h1 style="color: #fff; font-size: 48px; margin-bottom: 30px;">🚀 CosmoCraft</h1>
            <p style="color: #888; font-size: 18px; margin-bottom: 40px;">Вы сгорели в звезде...</p>
            <button id="restart-btn" style="
                padding: 15px 40px;
                font-size: 24px;
                background: #4488ff;
                color: white;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                font-weight: bold;
            ">🔄 Начать заново</button>
        `;
        
        document.body.appendChild(mainMenuEl);
        
        // Обработчик кнопки
        document.getElementById('restart-btn')?.addEventListener('click', () => {
            location.reload();
        });
    }

    // Расход ресурсов (двигатели, лазер)
    private consumeResources(deltaTime: number) {
        // Расход воды на двигатели
        if (this.throttle > 0) {
            const waterConsumption = (this.throttle / 100) * 1 * deltaTime; // 1 ед/сек при 100%
            this.water = Math.max(0, this.water - waterConsumption);
            
            // Если вода кончилась - двигатели не работают
            if (this.water <= 0) {
                this.throttle = 0;
                console.log('⚠️ Вода закончилась! Двигатели отключены.');
            }
        }
        
        // Расход энергии на лазер (при выстреле)
        if (this.laserFiring) {
            const laserCost = 1; // 1 единица за выстрел
            this.energy = Math.max(0, this.energy - laserCost);
        }
        
        // Расход энергии на двигатели
        if (this.throttle > 0) {
            const engineCost = (this.throttle / 100) * 10 * deltaTime; // 10 ед/сек при 100%
            this.energy = Math.max(0, this.energy - engineCost);
        }
    }

    private updateSatellites(deltaTime: number) {
        const orbitSpeed = 0.5;
        const orbitRadius = 30;

        this.satellites.forEach((satellite, index) => {
            const angle = Date.now() * 0.001 * orbitSpeed + (index * Math.PI * 2 / Math.max(1, this.satellites.length));
            
            const offset = new THREE.Vector3(
                Math.cos(angle) * orbitRadius,
                Math.sin(angle * 0.5) * orbitRadius * 0.5,
                Math.sin(angle) * orbitRadius
            );
            offset.applyQuaternion(this.shipQuaternion);
            
            satellite.position.copy(this.shipPosition).add(offset);
            satellite.rotation.x += deltaTime;
            satellite.rotation.y += deltaTime;
        });
    }

    // === Callback ===

    public setOnStatusUpdate(callback: (status: ShipStatus) => void) {
        this.onStatusUpdate = callback;
    }

    private notifyStatusUpdate() {
        if (this.onStatusUpdate) {
            this.onStatusUpdate(this.getStatus());
        }
    }

    public getStatus(): ShipStatus {
        return {
            speed: this.speed,
            maxSpeed: this.maxSpeed,
            throttle: this.throttle,
            turboMode: this.turboMode,
            setaMode: this.setaMode,
            setaBoost: this.setaBoost,
            cargoBayOpen: this.cargoBayOpen,
            laserActive: this.laserActive,
            currentMissile: this.currentMissile,
            shields: this.shields,
            energy: this.energy,
            energyCapacity: this.energyCapacity,
            water: this.water,
            waterCapacity: this.waterCapacity,
            radiation: this.radiation,
            starChargeRate: this.starChargeRate,
            cargo: { ...this.cargo },
            satellitesDeployed: this.satellitesDeployed
        };
    }

    // === Очистка ===

    public dispose() {
        window.removeEventListener('keydown', this.boundKeyDown);
        window.removeEventListener('keyup', this.boundKeyUp);
        window.removeEventListener('mousemove', this.boundMouseMove);
        window.removeEventListener('mousedown', this.boundMouseDown);

        // Удаляем группу корабля (камера автоматически отсоединяется)
        if (this.ship) {
            this.scene.remove(this.ship);
        }

        // Удаляем маркер выделения
        if (this.selectedObjectMarker) {
            this.scene.remove(this.selectedObjectMarker);
            this.selectedObjectMarker.geometry.dispose();
            (this.selectedObjectMarker.material as THREE.Material).dispose();
        }

        // Удаляем лазерные лучи
        if (this.laserBeamLeft) {
            this.scene.remove(this.laserBeamLeft);
            this.laserBeamLeft.geometry.dispose();
            (this.laserBeamLeft.material as THREE.Material).dispose();
        }
        if (this.laserBeamRight) {
            this.scene.remove(this.laserBeamRight);
            this.laserBeamRight.geometry.dispose();
            (this.laserBeamRight.material as THREE.Material).dispose();
        }
        if (this.laserHitSphere) {
            this.scene.remove(this.laserHitSphere);
            this.laserHitSphere.geometry.dispose();
            (this.laserHitSphere.material as THREE.Material).dispose();
        }

        // Удаляем частицы ресурсов
        this.resourceParticles.forEach(p => {
            this.scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            (p.mesh.material as THREE.Material).dispose();
        });
        this.resourceParticles = [];

        // Удаляем спутники
        this.satellites.forEach(s => {
            this.scene.remove(s);
            s.geometry.dispose();
            (s.material as THREE.Material).dispose();
        });
        this.satellites = [];
    }

    // === Геттеры ===

    public getPosition(): THREE.Vector3 {
        return this.shipPosition.clone();
    }

    public getQuaternion(): THREE.Quaternion {
        return this.shipQuaternion.clone();
    }

    public setCargo(cargo: { metal: number; silicon: number; ice: number; rare: number }) {
        this.cargo = { ...cargo };
        this.notifyStatusUpdate();
    }

    public addResource(type: 'metal' | 'silicon' | 'ice' | 'rare', amount: number) {
        this.cargo[type] += amount;
        this.notifyStatusUpdate();
    }

    public setAsteroids(asteroids: THREE.Group[]) {
        this.asteroids = asteroids;
    }
}
