// src/asteroids/AsteroidField.ts
import * as THREE from 'three';
import { Asteroid } from './Asteroid';
import { ResourceAmount } from '../types/core';

export class AsteroidField {
  id: string;
  asteroids: Map<string, Asteroid> = new Map();
  bounds: THREE.Box3;
  density: number;
  scene?: THREE.Scene;
  sectorId: string;
  
  constructor(
    id: string,
    center: THREE.Vector3,
    radius: number,
    density: number,
    sectorId: string,
    scene?: THREE.Scene
  ) {
    this.id = id;
    this.sectorId = sectorId;
    this.bounds = new THREE.Box3(
      new THREE.Vector3(center.x - radius, center.y - radius, center.z - radius),
      new THREE.Vector3(center.x + radius, center.y + radius, center.z + radius)
    );
    this.density = density;
    this.scene = scene;
  }
  
  generateField(types: string[]) {
    const count = Math.floor(this.density * 100);
    
    for (let i = 0; i < count; i++) {
      const pos = new THREE.Vector3(
        THREE.MathUtils.lerp(this.bounds.min.x, this.bounds.max.x, Math.random()),
        THREE.MathUtils.lerp(this.bounds.min.y, this.bounds.max.y, Math.random()),
        THREE.MathUtils.lerp(this.bounds.min.z, this.bounds.max.z, Math.random())
      );
      
      const typeKey = types[Math.floor(Math.random() * types.length)];
      
      const asteroid = new Asteroid(typeKey, pos, this.id);
      this.addAsteroid(asteroid);
    }
  }
  
  addAsteroid(asteroid: Asteroid) {
    this.asteroids.set(asteroid.id, asteroid);
    if (this.scene) {
      this.scene.add(asteroid.mesh);
    }
  }
  
  removeAsteroid(id: string) {
    const asteroid = this.asteroids.get(id);
    if (asteroid && this.scene) {
      this.scene.remove(asteroid.mesh);
    }
    this.asteroids.delete(id);
  }
  
  getAsteroid(id: string): Asteroid | undefined {
    return this.asteroids.get(id);
  }
  
  getNearbyAsteroids(position: THREE.Vector3, radius: number): Asteroid[] {
    const nearby: Asteroid[] = [];
    
    this.asteroids.forEach(asteroid => {
      if (asteroid.position.distanceTo(position) <= radius) {
        nearby.push(asteroid);
      }
    });
    
    return nearby;
  }
  
  toJSON() {
    return {
      id: this.id,
      sectorId: this.sectorId,
      bounds: {
        min: this.bounds.min,
        max: this.bounds.max
      },
      density: this.density,
      asteroids: Array.from(this.asteroids.values()).map(a => a.toJSON())
    };
  }
}
