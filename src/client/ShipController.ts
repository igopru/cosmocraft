// src/client/ShipController.ts
import * as THREE from 'three';

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

    // Скорость и движение
    private velocity: THREE.Vector3;
    private speed: number = 0;
    private maxSpeed: number = 100;
    private throttle: number = 0; // 0-100%
    private acceleration: number = 50; // м/с²

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

    // Состояние клавиш
    private keysPressed: Set<string> = new Set();

    // Лазерная визуализация
    private laserBeam: THREE.Line | null = null;
    private laserHitSphere: THREE.Mesh | null = null;
    private laserFiring: boolean = false;
    private laserCooldown: boolean = false;
    private laserFireRate: number = 0.15;

    // Векторы направления корабля (локальные оси)
    private shipForward: THREE.Vector3 = new THREE.Vector3(0, 0, -1);
    private shipRight: THREE.Vector3 = new THREE.Vector3(1, 0, 0);
    private shipUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

    // Визуализация корабля (стрелка)
    private shipArrow: THREE.ArrowHelper | null = null;

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

        // Инициализация позиции корабля
        this.shipPosition.copy(startPosition);
        this.shipQuaternion.identity();
        this.velocity = new THREE.Vector3();

        this.boundKeyDown = this.onKeyDown.bind(this);
        this.boundKeyUp = this.onKeyUp.bind(this);

        this.setupEventListeners();
        this.createLaserVisuals();
        this.createShipArrow();

        // Устанавливаем камеру на позицию корабля
        this.camera.position.copy(this.shipPosition);
        // Направляем камеру вниз на звезду (0, 0, 0)
        this.camera.lookAt(new THREE.Vector3(0, 0, 0));

        // Инициализируем локальные векторы
        // Корабль смотрит вниз по -Y (к звезде)
        this.shipForward.set(0, -1, 0);
        this.shipRight.set(1, 0, 0);
        this.shipUp.set(0, 0, 1);

        // Устанавливаем кватернион соответствующий направлению вниз
        this.shipQuaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.shipForward);
    }

    private setupEventListeners() {
        window.addEventListener('keydown', this.boundKeyDown);
        window.addEventListener('keyup', this.boundKeyUp);
    }

    // Создание визуальных эффектов лазера
    private createLaserVisuals() {
        const laserMaterial = new THREE.LineBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.8
        });

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([0, 0, 0, 0, 0, -100]);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.laserBeam = new THREE.Line(geometry, laserMaterial);
        this.laserBeam.visible = false;
        this.scene.add(this.laserBeam);

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

    // Создание визуальной стрелки корабля (индикатор направления)
    private createShipArrow() {
        // Создаём стрелку длиной 50 единиц, красного цвета
        this.shipArrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, -1), // направление (вперёд по -Z)
            this.shipPosition,            // позиция
            50,                           // длина
            0xff0000,                     // цвет (красный)
            10,                           // размер наконечника
            5                             // ширина основания
        );
        this.scene.add(this.shipArrow);
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
            case 'KeyP':
                this.showPilotInfo();
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

    private getResourceTypeFromAsteroid(asteroidType: string): 'metal' | 'silicon' | 'ice' | 'rare' {
        switch(asteroidType) {
            case 'silicon': return 'silicon';
            case 'icy': return 'ice';
            case 'rare': return 'rare';
            default: return 'metal';
        }
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
        // Поиск ближайшего астероида
        let nearestAsteroid = null;
        let minDistance = Infinity;

        for (const asteroid of this.asteroids) {
            const distance = asteroid.position.distanceTo(this.shipPosition);
            if (distance < minDistance) {
                minDistance = distance;
                nearestAsteroid = asteroid;
            }
        }

        if (nearestAsteroid) {
            const type = (nearestAsteroid.userData as any)?.type || 'Неизвестно';
            alert(`ℹ️ Астероид\nТип: ${type}\nДистанция: ${minDistance.toFixed(0)} м`);
        } else {
            alert('ℹ️ Астероиды не обнаружены');
        }
    }

    private showPilotInfo() {
        alert('👤 Пилот:\n- Ранг: Новичок\n- Миссий: 0');
    }

    private showShipInfo() {
        alert(`🚀 Корабль:\n- Щит: ${this.shields}%\n- Груз: ${this.getTotalCargo()} ед.`);
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

        // Пускаем луч из центра камеры
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersects = raycaster.intersectObjects(this.scene.children, true);

        if (intersects.length > 0) {
            const hitPoint = intersects[0].point;
            const hitObject = intersects[0].object;

            const camPos = this.camera.position;

            // Обновляем луч
            const positions = this.laserBeam!.geometry.attributes.position.array as Float32Array;
            positions[0] = camPos.x;
            positions[1] = camPos.y;
            positions[2] = camPos.z;
            positions[3] = hitPoint.x;
            positions[4] = hitPoint.y;
            positions[5] = hitPoint.z;
            this.laserBeam!.geometry.attributes.position.needsUpdate = true;
            this.laserBeam!.visible = true;

            // Визуализация попадания
            if (this.laserHitSphere) {
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
            }

            // Проверяем, астероид ли это
            let parent = hitObject;
            while (parent && !parent.userData?.type) {
                parent = parent.parent as THREE.Object3D;
            }

            if (parent && parent.userData?.type) {
                // Это астероид! Создаём частицу ресурса
                this.fireLaserAtAsteroid(parent as THREE.Group, parent.userData.type);
            }
        }

        // Скрываем луч через 150мс
        setTimeout(() => {
            if (this.laserBeam) this.laserBeam.visible = false;
            if (this.laserHitSphere) this.laserHitSphere.visible = false;
            this.laserActive = false;
            this.notifyStatusUpdate();
        }, 150);

        this.notifyStatusUpdate();
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
            child !== this.laserBeam &&
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
        this.shipQuaternion.identity();
        this.velocity.set(0, 0, 0);
        this.throttle = 0;
        this.speed = 0;
        this.shields = 100;

        this.camera.position.copy(this.shipPosition);
        this.camera.lookAt(this.shipPosition.clone().add(new THREE.Vector3(0, 0, -1)));

        this.shipForward.set(0, 0, -1);
        this.shipRight.set(1, 0, 0);
        this.shipUp.set(0, 1, 0);

        console.log('✅ Респавн completed! Щиты восстановлены.');
        this.notifyStatusUpdate();
    }

    // === Обновление физики ===

    public update(deltaTime: number) {
        // 1. Вращение корабля вокруг ЛОКАЛЬНЫХ осей (стрелки)
        const rotationSpeed = 2.5 * deltaTime;

        // Вращение вокруг локальной оси Y (yaw - влево/вправо)
        if (this.keysPressed.has('ArrowLeft')) {
            const rotationQuaternion = new THREE.Quaternion();
            rotationQuaternion.setFromAxisAngle(
                new THREE.Vector3(0, 1, 0).applyQuaternion(this.shipQuaternion),
                rotationSpeed
            );
            this.shipQuaternion.multiply(rotationQuaternion);
        }
        if (this.keysPressed.has('ArrowRight')) {
            const rotationQuaternion = new THREE.Quaternion();
            rotationQuaternion.setFromAxisAngle(
                new THREE.Vector3(0, 1, 0).applyQuaternion(this.shipQuaternion),
                -rotationSpeed
            );
            this.shipQuaternion.multiply(rotationQuaternion);
        }

        // Вращение вокруг локальной оси X (pitch - вверх/вниз)
        if (this.keysPressed.has('ArrowUp')) {
            const rotationQuaternion = new THREE.Quaternion();
            rotationQuaternion.setFromAxisAngle(
                new THREE.Vector3(1, 0, 0).applyQuaternion(this.shipQuaternion),
                rotationSpeed
            );
            this.shipQuaternion.multiply(rotationQuaternion);
        }
        if (this.keysPressed.has('ArrowDown')) {
            const rotationQuaternion = new THREE.Quaternion();
            rotationQuaternion.setFromAxisAngle(
                new THREE.Vector3(1, 0, 0).applyQuaternion(this.shipQuaternion),
                -rotationSpeed
            );
            this.shipQuaternion.multiply(rotationQuaternion);
        }

        // Нормализуем кватернион
        this.shipQuaternion.normalize();

        // 2. Обновляем локальные векторы направления
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

        // 5. Проверка столкновений
        if (!this.collisionCooldown) {
            if (this.checkCollisions()) {
                this.handleCollision();
            }
        }

        // 6. Обновляем позицию камеры
        this.camera.position.copy(this.shipPosition);

        // 7. Камера смотрит строго в направлении носа корабля
        // Направление взгляда = shipForward (локальная ось -Z)
        const lookDirection = this.shipForward.clone().normalize();
        const lookAtPoint = this.shipPosition.clone().add(lookDirection.multiplyScalar(100));

        this.camera.lookAt(lookAtPoint);

        // 8. Стрельба из лазера
        if (this.laserFiring) {
            this.fireLaser();
        }

        // 9. Обновление стрелки корабля (визуальный индикатор)
        if (this.shipArrow) {
            this.shipArrow.position.copy(this.shipPosition);
            this.shipArrow.setDirection(this.shipForward.clone().normalize());
        }

        // 10. Обновление частиц ресурсов
        this.updateResourceParticles(deltaTime);

        // 11. Обновление спутников (орбита вокруг корабля)
        this.updateSatellites(deltaTime);

        // 12. Обновляем HUD
        this.notifyStatusUpdate();
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
            cargo: { ...this.cargo },
            satellitesDeployed: this.satellitesDeployed
        };
    }

    // === Очистка ===

    public dispose() {
        window.removeEventListener('keydown', this.boundKeyDown);
        window.removeEventListener('keyup', this.boundKeyUp);

        if (this.laserBeam) {
            this.scene.remove(this.laserBeam);
            this.laserBeam.geometry.dispose();
            (this.laserBeam.material as THREE.Material).dispose();
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
