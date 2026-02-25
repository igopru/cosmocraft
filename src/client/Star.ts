// src/client/Star.ts
import * as THREE from 'three';

export class Star {
    private mesh: THREE.Group;
    private core: THREE.Mesh;
    private corona: THREE.Mesh;
    private particles: THREE.Points;
    private light: THREE.PointLight;
    
    constructor() {
        this.mesh = new THREE.Group();
        this.core = this.createCore();
        this.corona = this.createCorona();
        this.particles = this.createParticles();
        this.light = this.createLight();
        
        this.mesh.add(this.core);
        this.mesh.add(this.corona);
        this.mesh.add(this.particles);
    }
    
    private createCore(): THREE.Mesh {
        const geometry = new THREE.SphereGeometry(30, 64, 64);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffaa33,
            emissive: 0xff5500,
            emissiveIntensity: 2.0
        });
        return new THREE.Mesh(geometry, material);
    }
    
    private createCorona(): THREE.Mesh {
        const geometry = new THREE.SphereGeometry(35, 64, 64);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff8833,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        return new THREE.Mesh(geometry, material);
    }
    
    private createParticles(): THREE.Points {
        const particleCount = 1000;
        const positions = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount; i++) {
            const radius = 40 + Math.random() * 20;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 2;
            
            positions[i*3] = radius * Math.sin(theta) * Math.cos(phi);
            positions[i*3+1] = radius * Math.sin(theta) * Math.sin(phi);
            positions[i*3+2] = radius * Math.cos(theta);
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: 0xffaa33,
            size: 0.5,
            blending: THREE.AdditiveBlending
        });
        
        return new THREE.Points(geometry, material);
    }
    
    private createLight(): THREE.PointLight {
        const light = new THREE.PointLight(0xffaa66, 2, 0, 0);
        light.position.set(0, 0, 0);
        return light;
    }
    
    public getMesh(): THREE.Group {
        return this.mesh;
    }
    
    public getLight(): THREE.PointLight {
        return this.light;
    }
    
    public update(deltaTime: number) {
        this.corona.rotation.y += 0.0005;
        this.particles.rotation.y += 0.001;
        
        const scale = 1 + Math.sin(Date.now() * 0.002) * 0.02;
        this.corona.scale.set(scale, scale, scale);
    }
}
