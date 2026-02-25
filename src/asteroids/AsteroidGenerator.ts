// src/asteroids/AsteroidGenerator.ts
import * as THREE from 'three';
import { Asteroid } from './Asteroid';
import { AsteroidField } from './AsteroidField';

// Простая реализация шума без внешних зависимостей
class SimpleNoise {
  private seed: number;
  
  constructor(seed: string = 'cosmocraft') {
    // Простая хеш-функция для строки
    this.seed = seed.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);
  }
  
  // Простой псевдо-случайный шум
  noise3D(x: number, y: number, z: number): number {
    // Используем простую хеш-функцию для координат
    const hash = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + this.seed) * 43758.5453;
    return hash - Math.floor(hash);
  }
}

export class AsteroidGenerator {
  private noise: SimpleNoise;
  
  constructor(seed: string = 'cosmocraft') {
    this.noise = new SimpleNoise(seed);
  }
  
  generateField(
    id: string,
    center: THREE.Vector3,
    radius: number,
    density: number,
    sectorId: string,
    types: string[]
  ): AsteroidField {
    const field = new AsteroidField(id, center, radius, density, sectorId);
    
    const count = Math.floor(density * radius * radius / 1000);
    
    for (let i = 0; i < count; i++) {
      const angle1 = Math.random() * Math.PI * 2;
      const angle2 = Math.random() * Math.PI * 2;
      const r = radius * Math.pow(Math.random(), 1.5);
      
      const x = center.x + r * Math.sin(angle1) * Math.cos(angle2);
      const y = center.y + r * Math.sin(angle1) * Math.sin(angle2);
      const z = center.z + r * Math.cos(angle1);
      
      const noiseValue = this.noise.noise3D(x / 100, y / 100, z / 100);
      if (noiseValue > 0.2) {
        const typeKey = this.selectType(types, x, y, z);
        const pos = new THREE.Vector3(x, y, z);
        const asteroid = new Asteroid(typeKey, pos, field.id);
        field.addAsteroid(asteroid);
      }
    }
    
    return field;
  }
  
  private selectType(types: string[], x: number, y: number, z: number): string {
    const value = this.noise.noise3D(x / 50, y / 50, z / 50);
    
    if (value < 0.25) return 'rare';
    if (value < 0.5) return 'icy';
    if (value < 0.75) return 'silicon';
    return 'metallic';
  }
  
  respawnAsteroid(field: AsteroidField, position: THREE.Vector3): Asteroid | null {
    if (field.asteroids.size < 50) {
      const typeKey = this.selectType(['metallic', 'silicon', 'icy', 'rare'], 
        position.x, position.y, position.z);
      const asteroid = new Asteroid(typeKey, position, field.id);
      field.addAsteroid(asteroid);
      return asteroid;
    }
    return null;
  }
}
