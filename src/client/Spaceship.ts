// src/client/Spaceship.ts
import * as THREE from 'three';

export interface SpaceshipConfig {
    maxSpeed: number;
    acceleration: number;
    rotationSpeed: number;
    damping: number;
    rollSensitivity: number;
    mouseSensitivity: number;
    wasdArrowsDuplicate: boolean; // Дублирование WASD на стрелки
    spritePath?: string; // Путь к спрайту корабля
    hideShip?: boolean; // Скрыть модель корабля в FPV
    showGunHUD?: boolean; // Показать ориентиры орудий по краям
}

const DEFAULT_CONFIG: SpaceshipConfig = {
    maxSpeed: 800,
    acceleration: 200,
    rotationSpeed: 3.0,
    damping: 0.95,
    rollSensitivity: 0.5,
    mouseSensitivity: 0.003,
    wasdArrowsDuplicate: true,
    spritePath: undefined,
    hideShip: true, // По умолчанию скрываем корабль в FPV
    showGunHUD: true // По умолчанию показываем ориентиры орудий
};

export class Spaceship {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private config: SpaceshipConfig;
    
    // Позиция и движение
    private position: THREE.Vector3;
    private velocity: THREE.Vector3;
    private rotation: THREE.Euler;
    private quaternion: THREE.Quaternion;
    
    // Состояние управления
    private keys: { [key: string]: boolean } = {};
    private mousePosition: THREE.Vector2 = new THREE.Vector2(0, 0);
    private isMouseLocked: boolean = false;
    private isFocused: boolean = false; // Левая кнопка мыши - фокусировка
    private isStabilizing: boolean = false; // Правая кнопка мыши - стабилизация
    private isLanding: boolean = false; // Режим посадки
    
    // Визуализация
    private mesh: THREE.Group | null = null;
    private sprite: THREE.Sprite | null = null;
    private crosshair: HTMLElement | null = null;
    private gunHUDLeft: HTMLElement | null = null; // Левый ориентир орудия
    private gunHUDRight: HTMLElement | null = null; // Правый ориентир орудия
    
    // Callback для получения визуальной информации
    private onVisualUpdate?: (info: VisualInfo) => void;
    
    // Целевая точка фокусировки
    private focusTarget: THREE.Vector3 | null = null;
    
    // Станции для посадки
    private landingStations: { position: THREE.Vector3; name: string }[] = [];
    private nearestStation: { position: THREE.Vector3; name: string; distance: number } | null = null;

    constructor(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        config: Partial<SpaceshipConfig> = {}
    ) {
        this.scene = scene;
        this.camera = camera;
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Синхронизируем начальную позицию корабля с камерой
        this.position = camera.position.clone();
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        this.quaternion = camera.quaternion.clone();

        this.setupControls();
        this.createVisuals();
        this.createCrosshair();
    }

    private setupControls() {
        // Обработчик нажатий клавиш
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        
        // Обработчик движения мыши
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        
        // Обработчики кнопок мыши
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        
        // Клик по canvas захватывает мышь и позволяет управлять
        const canvas = this.camera as any;
        canvas.addEventListener('click', () => {
            if (!this.isMouseLocked) {
                canvas.requestPointerLock();
            }
        });
        
        document.addEventListener('pointerlockchange', () => {
            this.isMouseLocked = document.pointerLockElement === canvas;
        });
        
        // Блокируем контекстное меню на canvas
        canvas.addEventListener('contextmenu', (e: Event) => e.preventDefault());
    }

    private onKeyDown(event: KeyboardEvent) {
        const key = event.code;
        this.keys[key] = true;
        
        // Клавиша ` (тильда/ё) - посадка на станцию
        if (key === 'Backquote') {
            this.toggleLandingMode();
        }
        
        // Клавиша F - переключение вида (спрайт/меш)
        if (key === 'KeyF') {
            this.toggleVisualMode();
        }
    }

    private onKeyUp(event: KeyboardEvent) {
        const key = event.code;
        this.keys[key] = false;
    }

    private handleMouseMove(event: MouseEvent) {
        if (!this.isMouseLocked) return;
        
        // Чувствительность мыши
        const sensitivity = this.config.mouseSensitivity;
        
        // Вращение от движения мыши
        this.rotation.y -= event.movementX * sensitivity;
        this.rotation.x -= event.movementY * sensitivity;
        
        // Ограничение вертикального угла
        this.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.x));
        
        this.quaternion.setFromEuler(this.rotation);
    }

    public onMouseMove(event: MouseEvent) {
        this.handleMouseMove(event);
    }

    private handleMouseDown(event: MouseEvent) {
        if (!this.isMouseLocked) return;

        // Левая кнопка - фокусировка на точке
        if (event.button === 0) {
            this.isFocused = true;
            this.setFocusTarget();
        }

        // Правая кнопка - стабилизация вращения
        if (event.button === 2) {
            this.isStabilizing = true;
        }
    }

    public onMouseDown(event: MouseEvent) {
        this.handleMouseDown(event);
    }

    private handleMouseUp(event: MouseEvent) {
        // Левая кнопка - снять фокусировку
        if (event.button === 0) {
            this.isFocused = false;
            this.focusTarget = null;
        }

        // Правая кнопка - прекратить стабилизацию
        if (event.button === 2) {
            this.isStabilizing = false;
        }
    }

    public onMouseUp(event: MouseEvent) {
        this.handleMouseUp(event);
    }

    private setFocusTarget() {
        // Получаем точку куда смотрит камера
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        
        // Создаем луч из камеры
        const raycaster = new THREE.Raycaster(
            this.camera.position,
            direction
        );
        
        // Ищем пересечения с объектами сцены
        const intersects = raycaster.intersectObjects(this.scene.children, true);
        
        if (intersects.length > 0) {
            this.focusTarget = intersects[0].point.clone();
        } else {
            // Если ничего не нашли, берем точку на расстоянии 1000 единиц
            this.focusTarget = this.camera.position.clone().add(direction.multiplyScalar(1000));
        }
    }

    private createVisuals() {
        // Создаем группу для корабля
        this.mesh = new THREE.Group();

        // Если задан спрайт - используем его
        if (this.config.spritePath) {
            this.createSpriteVisual();
        } else {
            // Создаем простую модель корабля (треугольная форма)
            this.createDefaultVisual();
        }

        // Добавляем двигатели (свечение)
        this.createEngineGlow();

        // Скрываем корабль если нужно (FPV режим)
        if (this.config.hideShip) {
            this.mesh.visible = false;
        }

        this.scene.add(this.mesh);

        // Создаём GUI с орудиями
        if (this.config.showGunHUD) {
            this.createGunHUD();
        }
    }

    private createDefaultVisual() {
        // Корпус корабля - конус
        const bodyGeometry = new THREE.ConeGeometry(2, 10, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x4488ff,
            metalness: 0.8,
            roughness: 0.2,
            emissive: 0x112244,
            emissiveIntensity: 0.3
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.rotation.x = Math.PI / 2; // Поворачиваем чтобы смотрел вперед
        this.mesh!.add(body);
        
        // Крылья
        const wingGeometry = new THREE.BoxGeometry(8, 0.5, 3);
        const wingMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x3366cc,
            metalness: 0.7,
            roughness: 0.3
        });
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        wings.position.z = 2;
        this.mesh!.add(wings);
        
        // Двигатели
        const engineGeometry = new THREE.CylinderGeometry(1, 1.5, 3, 8);
        const engineMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x666666,
            metalness: 0.9,
            roughness: 0.1
        });
        
        const leftEngine = new THREE.Mesh(engineGeometry, engineMaterial);
        leftEngine.rotation.x = Math.PI / 2;
        leftEngine.position.set(-3, 0, 3);
        this.mesh!.add(leftEngine);
        
        const rightEngine = new THREE.Mesh(engineGeometry, engineMaterial);
        rightEngine.rotation.x = Math.PI / 2;
        rightEngine.position.set(3, 0, 3);
        this.mesh!.add(rightEngine);
    }

    private createSpriteVisual() {
        // Загрузка текстуры спрайта
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(this.config.spritePath!, (texture) => {
            const spriteMaterial = new THREE.SpriteMaterial({ 
                map: texture,
                color: 0xffffff
            });
            this.sprite = new THREE.Sprite(spriteMaterial);
            this.sprite.scale.set(20, 10, 1);
            this.mesh!.add(this.sprite);
        });
    }

    private createEngineGlow() {
        // Свет от двигателей
        const glowLight = new THREE.PointLight(0xff6600, 1, 50);
        glowLight.position.set(0, 0, 8);
        this.mesh!.add(glowLight);
        
        // Частицы двигателей (упрощенно)
        const glowGeometry = new THREE.SphereGeometry(1.5, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff6600,
            transparent: true,
            opacity: 0.7
        });
        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
        glowMesh.position.set(0, 0, 8);
        this.mesh!.add(glowMesh);
    }

    private createCrosshair() {
        // Создаем прицел в центре экрана
        this.crosshair = document.createElement('div');
        this.crosshair.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 40px;
            height: 40px;
            pointer-events: none;
            z-index: 1000;
            display: none;
        `;
        
        // Внутренний круг прицела
        const innerCircle = document.createElement('div');
        innerCircle.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 4px;
            height: 4px;
            background: #00ff00;
            border-radius: 50%;
        `;
        
        // Внешнее кольцо
        const outerRing = document.createElement('div');
        outerRing.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 30px;
            height: 30px;
            border: 2px solid rgba(0, 255, 0, 0.5);
            border-radius: 50%;
        `;
        
        this.crosshair.appendChild(innerCircle);
        this.crosshair.appendChild(outerRing);
        document.body.appendChild(this.crosshair);
    }

    private createGunHUD() {
        // Левый ориентир орудия
        this.gunHUDLeft = document.createElement('div');
        this.gunHUDLeft.style.cssText = `
            position: fixed;
            left: 20px;
            bottom: 20px;
            width: 150px;
            height: 100px;
            pointer-events: none;
            z-index: 1000;
            background: linear-gradient(135deg, rgba(0, 100, 255, 0.3) 0%, rgba(0, 50, 150, 0.1) 100%);
            border: 2px solid rgba(0, 150, 255, 0.5);
            border-radius: 10px 0 0 0;
            box-shadow: 0 0 20px rgba(0, 150, 255, 0.3);
        `;

        // Внутренние элементы левого орудия
        const leftGunBarrel = document.createElement('div');
        leftGunBarrel.style.cssText = `
            position: absolute;
            bottom: 10px;
            left: 10px;
            width: 40px;
            height: 60px;
            background: linear-gradient(90deg, rgba(100, 100, 100, 0.8) 0%, rgba(150, 150, 150, 0.4) 100%);
            border-radius: 5px 0 0 5px;
            transform: skewX(-10deg);
        `;

        const leftGunGlow = document.createElement('div');
        leftGunGlow.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 45px;
            width: 20px;
            height: 20px;
            background: radial-gradient(circle, rgba(0, 255, 100, 0.8) 0%, transparent 70%);
            border-radius: 50%;
            animation: gunPulse 2s infinite;
        `;

        this.gunHUDLeft.appendChild(leftGunBarrel);
        this.gunHUDLeft.appendChild(leftGunGlow);
        document.body.appendChild(this.gunHUDLeft);

        // Правый ориентир орудия (зеркальный)
        this.gunHUDRight = document.createElement('div');
        this.gunHUDRight.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 20px;
            width: 150px;
            height: 100px;
            pointer-events: none;
            z-index: 1000;
            background: linear-gradient(135deg, rgba(0, 100, 255, 0.3) 0%, rgba(0, 50, 150, 0.1) 100%);
            border: 2px solid rgba(0, 150, 255, 0.5);
            border-radius: 0 10px 0 0;
            box-shadow: 0 0 20px rgba(0, 150, 255, 0.3);
        `;

        // Внутренние элементы правого орудия
        const rightGunBarrel = document.createElement('div');
        rightGunBarrel.style.cssText = `
            position: absolute;
            bottom: 10px;
            right: 10px;
            width: 40px;
            height: 60px;
            background: linear-gradient(90deg, rgba(150, 150, 150, 0.4) 0%, rgba(100, 100, 100, 0.8) 100%);
            border-radius: 0 5px 5px 0;
            transform: skewX(10deg);
        `;

        const rightGunGlow = document.createElement('div');
        rightGunGlow.style.cssText = `
            position: absolute;
            bottom: 20px;
            right: 45px;
            width: 20px;
            height: 20px;
            background: radial-gradient(circle, rgba(0, 255, 100, 0.8) 0%, transparent 70%);
            border-radius: 50%;
            animation: gunPulse 2s infinite;
        `;

        this.gunHUDRight.appendChild(rightGunBarrel);
        this.gunHUDRight.appendChild(rightGunGlow);
        document.body.appendChild(this.gunHUDRight);

        // Добавляем CSS анимацию
        const style = document.createElement('style');
        style.textContent = `
            @keyframes gunPulse {
                0%, 100% { opacity: 0.5; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.2); }
            }
        `;
        document.head.appendChild(style);
    }

    public setVisualUpdateCallback(callback: (info: VisualInfo) => void) {
        this.onVisualUpdate = callback;
    }

    public addLandingStation(position: THREE.Vector3, name: string) {
        this.landingStations.push({ position, name });
    }

    private toggleLandingMode() {
        this.isLanding = !this.isLanding;
        
        if (this.isLanding) {
            // Ищем ближайшую станцию
            this.findNearestStation();
        }
    }

    private findNearestStation() {
        let minDistance = Infinity;
        let nearest = null;
        
        for (const station of this.landingStations) {
            const distance = this.position.distanceTo(station.position);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = { ...station, distance };
            }
        }
        
        this.nearestStation = nearest;
        
        if (nearest) {
            console.log(`🛬 Посадка на станцию: ${nearest.name} (расстояние: ${nearest.distance.toFixed(1)})`);
        } else {
            console.log('⚠️ Станции для посадки не найдены');
            this.isLanding = false;
        }
    }

    private toggleVisualMode() {
        // Переключение между спрайтом и мешем
        if (this.sprite) {
            this.sprite.visible = !this.sprite.visible;
        }
        if (this.mesh) {
            // Скрываем/показываем дочерние объекты кроме спрайта
            this.mesh.children.forEach(child => {
                if (child !== this.sprite) {
                    (child as THREE.Object3D).visible = !(child as THREE.Object3D).visible;
                }
            });
        }
    }

    private handleInput(delta: number) {
        // Направление вперёд (по направлению взгляда камеры)
        // В Three.js камера смотрит по -Z, поэтому forward = (0, 0, -1)
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(this.quaternion);
        forward.normalize();

        // Ускорение
        const acceleration = new THREE.Vector3(0, 0, 0);

        // Проверка дублирования WASD на стрелки
        const useArrows = this.config.wasdArrowsDuplicate;

        // W / Стрелка вверх - ВПЕРЁД по направлению взгляда
        if (this.keys['KeyW'] || (useArrows && this.keys['ArrowUp'])) {
            acceleration.add(forward.clone().multiplyScalar(this.config.acceleration * delta));
        }

        // S / Стрелка вниз - ТОРМОЖЕНИЕ или НАЗАД
        if (this.keys['KeyS'] || (useArrows && this.keys['ArrowDown'])) {
            const currentSpeed = this.velocity.length();
            // Если движемся вперёд - тормозим
            if (currentSpeed > 10) {
                // Тормозим (противоускорение)
                const brakeForce = this.velocity.clone().normalize().multiplyScalar(-this.config.acceleration * 1.5 * delta);
                acceleration.add(brakeForce);
            } else {
                // Если остановились - движемся назад
                acceleration.add(forward.clone().multiplyScalar(-this.config.acceleration * 0.5 * delta));
            }
        }

        // Применяем ускорение к скорости
        this.velocity.add(acceleration);

        // Ограничение скорости
        const speed = this.velocity.length();
        if (speed > this.config.maxSpeed) {
            this.velocity.normalize().multiplyScalar(this.config.maxSpeed);
        }

        // Вращение корабля от клавиш (работает всегда, не только при захвате мыши)
        // A / Стрелка влево - поворот носа ВЛЕВО (yaw)
        if (this.keys['KeyA'] || (useArrows && this.keys['ArrowLeft'])) {
            this.rotation.y += this.config.rotationSpeed * delta;
        }
        // D / Стрелка вправо - поворот носа ВПРАВО (yaw)
        if (this.keys['KeyD'] || (useArrows && this.keys['ArrowRight'])) {
            this.rotation.y -= this.config.rotationSpeed * delta;
        }
        // Q - тангаж ВВЕРХ (pitch)
        if (this.keys['KeyQ']) {
            this.rotation.x += this.config.rotationSpeed * delta;
        }
        // E - тангаж ВНИЗ (pitch)
        if (this.keys['KeyE']) {
            this.rotation.x -= this.config.rotationSpeed * delta;
        }

        this.quaternion.setFromEuler(this.rotation);
    }

    private handleStabilization(delta: number) {
        if (!this.isStabilizing) return;
        
        // Плавная стабилизация вращения
        const stabilizationSpeed = 5.0 * delta;
        
        // Затухание угловой скорости
        this.rotation.x *= (1 - stabilizationSpeed);
        this.rotation.y *= (1 - stabilizationSpeed);
        this.rotation.z *= (1 - stabilizationSpeed);
        
        this.quaternion.setFromEuler(this.rotation);
    }

    private handleFocus(delta: number) {
        if (!this.isFocused || !this.focusTarget) return;

        // Направление к цели
        const toTarget = new THREE.Vector3().subVectors(this.focusTarget, this.position);
        toTarget.normalize();

        // Текущее направление взгляда
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(this.quaternion);
        forward.normalize();

        // Угол между текущим направлением и целью
        const angle = forward.angleTo(toTarget);

        // Если угол большой - поворачиваемся к цели
        if (angle > 0.01) {
            const turnSpeed = this.config.rotationSpeed * delta * 2;

            // Находим ось вращения
            const axis = new THREE.Vector3().crossVectors(forward, toTarget);
            if (axis.length() > 0.001) {
                axis.normalize();

                // Поворачиваемся через кватернион
                const deltaQuaternion = new THREE.Quaternion();
                deltaQuaternion.setFromAxisAngle(axis, Math.min(angle, turnSpeed));
                this.quaternion.multiply(deltaQuaternion);
                this.quaternion.normalize();

                // Обновляем Euler из кватерниона
                this.rotation.setFromQuaternion(this.quaternion);
            }
        }
    }

    private handleLanding(delta: number) {
        if (!this.isLanding || !this.nearestStation) return;
        
        const stationPos = this.nearestStation.position;
        const distance = this.position.distanceTo(stationPos);
        
        // Автоматическое приближение к станции
        if (distance > 50) {
            const toStation = new THREE.Vector3().subVectors(stationPos, this.position);
            toStation.normalize();
            
            // Медленное движение к станции
            const landingSpeed = 20 * delta;
            this.position.add(toStation.multiplyScalar(landingSpeed));
            
            // Поворот к станции
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyQuaternion(this.quaternion);
            
            const angle = forward.angleTo(toStation);
            if (angle > 0.01) {
                const axis = new THREE.Vector3().crossVectors(forward, toStation);
                axis.normalize();
                const quaternion = new THREE.Quaternion();
                quaternion.setFromAxisAngle(axis, Math.min(angle, this.config.rotationSpeed * delta));
                this.quaternion.multiply(quaternion);
                this.rotation.setFromQuaternion(this.quaternion);
            }
        } else {
            // Посадка выполнена
            console.log('✅ Посадка выполнена!');
            this.isLanding = false;
            this.nearestStation = null;
            this.velocity.set(0, 0, 0);
        }
    }

    private updatePhysics(delta: number) {
        // Обработка ввода
        this.handleInput(delta);
        
        // Стабилизация
        this.handleStabilization(delta);
        
        // Фокусировка
        this.handleFocus(delta);
        
        // Посадка
        this.handleLanding(delta);
        
        // Ограничение скорости
        const speed = this.velocity.length();
        if (speed > this.config.maxSpeed) {
            this.velocity.normalize().multiplyScalar(this.config.maxSpeed);
        }
        
        // Затухание скорости (демпфирование)
        this.velocity.multiplyScalar(this.config.damping);
        
        // Обновление позиции
        this.position.add(this.velocity.clone().multiplyScalar(delta));
        
        // Обновление камеры (FPV вид)
        this.camera.position.copy(this.position);
        this.camera.quaternion.copy(this.quaternion);
        
        // Обновление меша корабля
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.quaternion.copy(this.quaternion);
        }
    }

    private updateVisualInfo() {
        if (!this.onVisualUpdate) return;
        
        const info: VisualInfo = {
            position: this.position.clone(),
            velocity: this.velocity.clone(),
            rotation: this.rotation.clone(),
            quaternion: this.quaternion.clone(),
            isFocused: this.isFocused,
            isStabilizing: this.isStabilizing,
            isLanding: this.isLanding,
            nearestStation: this.nearestStation,
            focusTarget: this.focusTarget
        };
        
        this.onVisualUpdate(info);
    }

    public update(delta: number) {
        this.updatePhysics(delta);
        this.updateVisualInfo();
        
        // Показываем прицел только при фокусировке
        if (this.crosshair) {
            this.crosshair.style.display = this.isFocused ? 'block' : 'none';
        }
    }

    public getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    public getVelocity(): THREE.Vector3 {
        return this.velocity.clone();
    }

    public getQuaternion(): THREE.Quaternion {
        return this.quaternion.clone();
    }

    public destroy() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
        }
        if (this.crosshair) {
            this.crosshair.remove();
        }
        if (this.gunHUDLeft) {
            this.gunHUDLeft.remove();
        }
        if (this.gunHUDRight) {
            this.gunHUDRight.remove();
        }
    }
}

export interface VisualInfo {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    rotation: THREE.Euler;
    quaternion: THREE.Quaternion;
    isFocused: boolean;
    isStabilizing: boolean;
    isLanding: boolean;
    nearestStation: { position: THREE.Vector3; name: string; distance: number } | null;
    focusTarget: THREE.Vector3 | null;
}
