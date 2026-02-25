// src/station/StationManager.ts
import * as THREE from 'three';
import { StationModule } from './StationModule';
import { ModuleType, ResourceType } from '../types/core';

export interface ModuleConnector {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  occupied: boolean;
  connectedModuleId?: string;
}

export class StationManager {
  modules: Map<string, StationModule> = new Map();
  scene?: THREE.Scene;
  
  constructor(scene?: THREE.Scene) {
    this.scene = scene;
  }
  
  createModule(type: ModuleType, position: THREE.Vector3): StationModule {
    return new StationModule(type, position);
  }
  
  addModule(module: StationModule, connectedTo?: StationModule) {
    this.modules.set(module.id, module);
    
    if (this.scene) {
      this.scene.add(module.mesh);
    }
    
    if (connectedTo) {
      this.connectModules(module, connectedTo);
    }
    
    this.updateModulePositions();
  }
  
  removeModule(moduleId: string) {
    const module = this.modules.get(moduleId);
    if (module && this.scene) {
      this.scene.remove(module.mesh);
      this.modules.delete(moduleId);
    }
  }
  
  connectModules(moduleA: StationModule, moduleB: StationModule) {
    let minDistance = Infinity;
    let connectorAIndex = -1;
    let connectorBIndex = -1;
    
    moduleA.connectors.forEach((a, i) => {
      moduleB.connectors.forEach((b, j) => {
        const distance = a.position.distanceTo(b.position);
        if (distance < minDistance && !a.occupied && !b.occupied) {
          minDistance = distance;
          connectorAIndex = i;
          connectorBIndex = j;
        }
      });
    });
    
    if (connectorAIndex !== -1 && connectorBIndex !== -1) {
      moduleA.connectors[connectorAIndex].occupied = true;
      moduleB.connectors[connectorBIndex].occupied = true;
      moduleA.connectors[connectorAIndex].connectedModuleId = moduleB.id;
      moduleB.connectors[connectorBIndex].connectedModuleId = moduleA.id;
    }
  }
  
  private updateModulePositions() {
    this.modules.forEach(module => {
      module.position.x = Math.round(module.position.x / 10) * 10;
      module.position.y = Math.round(module.position.y / 10) * 10;
      module.position.z = Math.round(module.position.z / 10) * 10;
      module.mesh.position.copy(module.position);
    });
  }
  
  getStationResources(): Map<ResourceType, number> {
    const resources = new Map<ResourceType, number>();
    
    this.modules.forEach(module => {
      if (module.type === ModuleType.STORAGE) {
        module.resources.forEach(r => {
          const current = resources.get(r.type) || 0;
          resources.set(r.type, current + r.amount);
        });
      }
    });
    
    return resources;
  }
  
  toJSON() {
    return Array.from(this.modules.values()).map(m => m.toJSON());
  }
}
