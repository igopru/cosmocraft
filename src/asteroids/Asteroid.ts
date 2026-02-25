// src/asteroids/Asteroid.ts
import * as THREE from 'three';
import { ResourceAmount, ResourceType } from '../types/core';

export interface AsteroidType {
  name: string;
  color: number;
  resources: ResourceAmount[];
  scale: number;
  hardness: number;
}

export class Asteroid {
  id: string;
  type: AsteroidType;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  mesh: THREE.Group;
  resources: ResourceAmount[];
  health: number;
  maxHealth: number;
  miningProgress: number = 0;
  fieldId: string;
  
  static types: Record<string, AsteroidType> = {
    metallic: {
      name: 'Металлический',
      color: 0x888888,
      resources: [{ type: ResourceType.METAL, amount: 500 }],
      scale: 20,
      hardness: 1.0
    },
    silicon: {
      name: 'Кремниевый',
      color: 0x66aaff,
      resources: [{ type: ResourceType.SILICON, amount: 400 }],
      scale: 15,
      hardness: 1.2
    },
    icy: {
      name: 'Ледяной',
      color: 0xaaddff,
      resources: [{ type: ResourceType.ICE, amount: 300 }],
      scale: 12,
      hardness: 0.8
    },
    rare: {
      name: 'Редкий',
      color: 0xffaa44,
      resources: [
        { type: ResourceType.RARE, amount: 100 },
        { type: ResourceType.METAL, amount: 200 }
      ],
      scale: 10,
      hardness: 1.5
    }
  };
  
  constructor(typeKey: string, position: THREE.Vector3, fieldId: string) {
    this.id = crypto.randomUUID();
    this.type = Asteroid.types[typeKey];
    this.position = position.clone();
    this.rotation = new THREE.Euler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );
    this.resources = this.type.resources.map(r => ({ ...r }));
    this.maxHealth = this.type.hardness * 100;
    this.health = this.maxHealth;
    this.fieldId = fieldId;
    this.mesh = this.createMesh();
  }
  
  private createMesh(): THREE.Group {
    const group = new THREE.Group();
    
    // Создаем воксельный астероид
    const size = this.type.scale;
    const voxelSize = 4;
    
    // Генерация вокселей внутри сферы
    for (let x = -size/2; x < size/2; x += voxelSize) {
      for (let y = -size/2; y < size/2; y += voxelSize) {
        for (let z = -size/2; z < size/2; z += voxelSize) {
          // Проверяем, находится ли воксель внутри сферы
          const pos = new THREE.Vector3(x, y, z);
          if (pos.length() < size/2 - voxelSize/2 && Math.random() > 0.3) {
            const voxelGeo = new THREE.BoxGeometry(voxelSize * 0.9, voxelSize * 0.9, voxelSize * 0.9);
            const voxelMat = new THREE.MeshStandardMaterial({
              color: this.type.color,
              roughness: 0.7,
              emissive: this.type.name === 'Редкий' ? 0x442200 : 0x000000
            });
            const voxel = new THREE.Mesh(voxelGeo, voxelMat);
            voxel.position.copy(pos);
            voxel.castShadow = true;
            voxel.receiveShadow = true;
            group.add(voxel);
          }
        }
      }
    }
    
    group.position.copy(this.position);
    group.rotation.copy(this.rotation);
    
    return group;
  }
  
  mine(damage: number): ResourceAmount[] {
    this.health -= damage;
    this.miningProgress = 1 - (this.health / this.maxHealth);
    
    // Визуальный эффект повреждения
    this.mesh.children.forEach((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshStandardMaterial;
        material.emissive.setHSL(0, 0, this.miningProgress * 0.5);
      }
    });
    
    if (this.health <= 0) {
      return this.resources;
    }
    
    return [];
  }
  
  toJSON() {
    return {
      id: this.id,
      typeKey: Object.keys(Asteroid.types).find(key => 
        Asteroid.types[key].name === this.type.name
      ),
      position: this.position,
      rotation: this.rotation,
      resources: this.resources,
      health: this.health,
      maxHealth: this.maxHealth,
      miningProgress: this.miningProgress,
      fieldId: this.fieldId
    };
  }
}
