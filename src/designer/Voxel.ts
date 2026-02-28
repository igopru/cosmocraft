// src/designer/Voxel.ts
import * as THREE from 'three';
import { VoxelType, VoxelData } from '../types/voxel.js';

export class Voxel {
  public mesh: THREE.Mesh;
  public type: VoxelType;
  public position: THREE.Vector3;
  
  private static readonly colors: Record<VoxelType, number> = {
    [VoxelType.EMPTY]: 0x000000,
    [VoxelType.HULL_LIGHT]: 0x888888,
    [VoxelType.HULL_MEDIUM]: 0x666666,
    [VoxelType.HULL_HEAVY]: 0x444444,
    [VoxelType.HULL_REINFORCED]: 0x222222,
    [VoxelType.SOLAR_PANEL]: 0x44aaff,
    [VoxelType.BATTERY]: 0xffaa44,
    [VoxelType.SHIELD_GEN]: 0x44ffaa,
    [VoxelType.THRUSTER]: 0xff4444,
    [VoxelType.CARGO_BAY]: 0xaa8844,
    [VoxelType.TURRET_MOUNT]: 0xaa44ff,
    [VoxelType.DOCKING_PORT]: 0x44aaff,
    [VoxelType.WINDOW]: 0xaaddff,
    [VoxelType.LIGHT]: 0xffffaa,
    [VoxelType.PAINT]: 0x88aaff
  };
  
  constructor(type: VoxelType, position: THREE.Vector3, size: number = 2) {
    this.type = type;
    this.position = position.clone();
    
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshStandardMaterial({
      color: Voxel.colors[type] || 0x888888,
      emissive: type === VoxelType.SOLAR_PANEL ? 0x224466 : 0x000000,
      transparent: type === VoxelType.WINDOW,
      opacity: type === VoxelType.WINDOW ? 0.7 : 1,
      roughness: type === VoxelType.HULL_HEAVY ? 0.8 : 0.5,
      metalness: type.includes('hull') ? 0.7 : 0.2
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    
    // Добавляем дополнительные детали для функциональных блоков
    this.addDetails(type);
  }
  
  private addDetails(type: VoxelType) {
    if (type === VoxelType.SOLAR_PANEL) {
      const panelGeo = new THREE.BoxGeometry(1.8, 0.2, 1.8);
      const panelMat = new THREE.MeshStandardMaterial({ color: 0x3333aa });
      const panel = new THREE.Mesh(panelGeo, panelMat);
      panel.position.y = 0.5;
      this.mesh.add(panel);
    }
    
    if (type === VoxelType.THRUSTER) {
      const nozzleGeo = new THREE.ConeGeometry(0.5, 1, 8);
      const nozzleMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
      const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
      nozzle.position.y = -0.5;
      nozzle.rotation.x = Math.PI;
      this.mesh.add(nozzle);
    }
    
    if (type === VoxelType.TURRET_MOUNT) {
      const baseGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.5, 8);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.3;
      this.mesh.add(base);
    }
  }
  
  public setColor(color: string) {
    if (this.type === VoxelType.PAINT) {
      (this.mesh.material as THREE.MeshStandardMaterial).color.set(color);
    }
  }
  
  public dispose() {
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) {
      this.mesh.material.forEach(m => m.dispose());
    } else {
      this.mesh.material.dispose();
    }
  }
}
