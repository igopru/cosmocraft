// src/client/VoxelStar.ts
import * as THREE from 'three';

export class VoxelStar {
    private group: THREE.Group;
    private core: THREE.Group;
    private corona: THREE.Group;
    private particles: THREE.Points;
    private light: THREE.PointLight;
    
    constructor(seed: number = 12345) {
        this.group = new THREE.Group();
        this.core = this.createVoxelCore(seed);
        this.corona = this.createVoxelCorona(seed);
        this.particles = this.createParticles(seed);
        this.light = this.createLight();
        
        this.group.add(this.core);
        this.group.add(this.corona);
        this.group.add(this.particles);
    }
    
    private createVoxelCore(seed: number): THREE.Group {
        const group = new THREE.Group();
        const random = this.createSeededRandom(seed);
        
        // Размеры звезды
        const coreSize = 30;
        const voxelSize = 4;
        
        // Цвета для разных слоев
        const colors = [
            0xffaa33, // внешний слой
            0xff8833,
            0xff6633,
            0xff4433,
            0xff3333  // ядро
        ];
        
        for (let x = -coreSize; x < coreSize; x += voxelSize) {
            for (let y = -coreSize; y < coreSize; y += voxelSize) {
                for (let z = -coreSize; z < coreSize; z += voxelSize) {
                    const dist = Math.sqrt(x*x + y*y + z*z);
                    
                    // Плотность вокселей увеличивается к центру
                    const density = 1 - (dist / coreSize);
                    
                    if (random() < density * 0.8) {
                        // Выбираем цвет на основе расстояния
                        const colorIndex = Math.floor((dist / coreSize) * colors.length);
                        const color = colors[Math.min(colorIndex, colors.length - 1)];
                        
                        // Размер вокселя зависит от расстояния
                        const scale = 0.8 + (1 - dist/coreSize) * 0.7;
                        
                        const voxelGeo = new THREE.BoxGeometry(voxelSize * scale, voxelSize * scale, voxelSize * scale);
                        const voxelMat = new THREE.MeshStandardMaterial({
                            color: color,
                            emissive: color,
                            emissiveIntensity: 1.5 - (dist / coreSize),
                            transparent: true,
                            opacity: 0.9
                        });
                        
                        const voxel = new THREE.Mesh(voxelGeo, voxelMat);
                        voxel.position.set(x, y, z);
                        
                        // Добавляем случайное мерцание
                        (voxel as any).userData = {
                            baseIntensity: voxelMat.emissiveIntensity,
                            speed: 0.5 + random() * 0.5,
                            phase: random() * Math.PI * 2
                        };
                        
                        group.add(voxel);
                    }
                }
            }
        }
        
        return group;
    }
    
    private createVoxelCorona(seed: number): THREE.Group {
        const group = new THREE.Group();
        const random = this.createSeededRandom(seed + 1000);
        
        const coronaSize = 50;
        const voxelSize = 6;
        
        for (let i = 0; i < 200; i++) {
            // Случайное положение на сфере
            const theta = random() * Math.PI * 2;
            const phi = random() * Math.PI * 2;
            const radius = coronaSize + random() * 20;
            
            const x = radius * Math.sin(theta) * Math.cos(phi);
            const y = radius * Math.sin(theta) * Math.sin(phi);
            const z = radius * Math.cos(theta);
            
            const voxelGeo = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
            const voxelMat = new THREE.MeshStandardMaterial({
                color: 0xffaa33,
                emissive: 0xff4400,
                transparent: true,
                opacity: 0.1 + random() * 0.2,
                blending: THREE.AdditiveBlending
            });
            
            const voxel = new THREE.Mesh(voxelGeo, voxelMat);
            voxel.position.set(x, y, z);
            
            (voxel as any).userData = {
                basePos: new THREE.Vector3(x, y, z),
                speed: 0.2 + random() * 0.3,
                phase: random() * Math.PI * 2
            };
            
            group.add(voxel);
        }
        
        return group;
    }
    
    private createParticles(seed: number): THREE.Points {
        const random = this.createSeededRandom(seed + 2000);
        const particleCount = 2000;
        
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount; i++) {
            const radius = 80 + random() * 60;
            const theta = random() * Math.PI * 2;
            const phi = random() * Math.PI * 2;
            
            positions[i*3] = radius * Math.sin(theta) * Math.cos(phi);
            positions[i*3+1] = radius * Math.sin(theta) * Math.sin(phi);
            positions[i*3+2] = radius * Math.cos(theta);
            
            // Цвет от желтого до оранжевого
            colors[i*3] = 1.0;
            colors[i*3+1] = 0.5 + random() * 0.5;
            colors[i*3+2] = 0.0;
        }
        
        const particleGeo = new THREE.BufferGeometry();
        particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const particleMat = new THREE.PointsMaterial({
            size: 2,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        return new THREE.Points(particleGeo, particleMat);
    }
    
    private createLight(): THREE.PointLight {
        const light = new THREE.PointLight(0xffaa66, 2, 0, 0);
        light.position.set(0, 0, 0);
        light.castShadow = true;
        return light;
    }
    
    private createSeededRandom(seed: number): () => number {
        return function() {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
    }
    
    public getMesh(): THREE.Group {
        return this.group;
    }
    
    public getLight(): THREE.PointLight {
        return this.light;
    }
    
    public update(deltaTime: number) {
        // Анимируем мерцание ядра
        this.core.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const data = (child as any).userData;
                if (data) {
                    const material = child.material as THREE.MeshStandardMaterial;
                    const time = Date.now() * 0.001;
                    material.emissiveIntensity = data.baseIntensity * (0.8 + 0.2 * Math.sin(time * data.speed + data.phase));
                }
            }
        });
        
        // Анимируем корону
        this.corona.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
                const data = (child as any).userData;
                if (data) {
                    const time = Date.now() * 0.001;
                    child.position.x = data.basePos.x + Math.sin(time * data.speed + data.phase) * 5;
                    child.position.y = data.basePos.y + Math.cos(time * data.speed + data.phase) * 5;
                    child.position.z = data.basePos.z + Math.sin(time * data.speed + data.phase * 2) * 5;
                }
            }
        });
        
        // Вращаем частицы
        this.particles.rotation.y += 0.0002;
    }
}
