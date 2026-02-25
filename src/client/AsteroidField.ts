// src/client/AsteroidField.ts
import * as THREE from 'three';
import { Asteroid } from './Asteroid.js';

export class AsteroidField {
    private asteroids: Asteroid[] = [];
    private scene: THREE.Scene;
    private center: THREE.Vector3;
    private radius: number;
    
    constructor(scene: THREE.Scene, center: THREE.Vector3, radius: number, count: number) {
        this.scene = scene;
        this.center = center;
        this.radius = radius;
        
        this.generateField(count);
    }
    
    private generateField(count: number) {
        const types = ['metallic', 'silicon', 'icy', 'rare'];
        
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = this.radius * Math.sqrt(Math.random());
            const height = (Math.random() - 0.5) * this.radius * 0.5;
            
            const x = this.center.x + distance * Math.cos(angle);
            const z = this.center.z + distance * Math.sin(angle);
            const y = this.center.y + height;
            
            const type = types[Math.floor(Math.random() * types.length)];
            const asteroid = new Asteroid(new THREE.Vector3(x, y, z), type);
            
            this.asteroids.push(asteroid);
            this.scene.add(asteroid.getMesh());
        }
    }
    
    public update() {
        this.asteroids.forEach(asteroid => asteroid.update());
    }
}
