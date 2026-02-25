// src/station/StationModule.ts
import * as THREE from 'three';
import { ModuleType, ResourceAmount, ResourceType } from '../types/core';

export interface ModuleConnector {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  occupied: boolean;
  connectedModuleId?: string;
}

export class StationModule {
  id: string;
  type: ModuleType;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  connectors: ModuleConnector[] = [];
  resources: ResourceAmount[] = [];
  mesh: THREE.Group;
  health: number = 100;
  
  constructor(
    type: ModuleType,
    position: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
  ) {
    this.id = crypto.randomUUID();
    this.type = type;
    this.position = position.clone();
    this.rotation = new THREE.Euler(0, 0, 0);
    this.connectors = this.createConnectors();
    this.resources = this.getBuildRequirements();
    this.mesh = this.createMesh();
  }
  
  private createConnectors(): ModuleConnector[] {
    const directions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1)
    ];
    
    return directions.map(dir => ({
      position: this.position.clone().add(dir.multiplyScalar(10)),
      direction: dir.clone(),
      occupied: false
    }));
  }
  
  private createMesh(): THREE.Group {
    const group = new THREE.Group();
    
    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const material = new THREE.MeshStandardMaterial({
      color: this.getModuleColor(),
      emissive: this.type === ModuleType.SOLAR ? 0x444400 : 0x000000,
      transparent: true,
      opacity: 0.9
    });
    
    const cube = new THREE.Mesh(geometry, material);
    cube.castShadow = true;
    cube.receiveShadow = true;
    group.add(cube);
    
    const details = this.createModuleDetails();
    details.forEach(detail => group.add(detail));
    
    this.addConnectorVisuals(group);
    
    group.position.copy(this.position);
    group.rotation.copy(this.rotation);
    
    return group;
  }
  
  private createModuleDetails(): THREE.Mesh[] {
    const details: THREE.Mesh[] = [];
    
    switch(this.type) {
      case ModuleType.HABITAT:
        {
          const windowGeo = new THREE.BoxGeometry(2, 2, 0.5);
          const windowMat = new THREE.MeshStandardMaterial({ color: 0x88aaff });
          const window = new THREE.Mesh(windowGeo, windowMat);
          window.position.set(0, 0, 5.1);
          details.push(window);
        }
        break;
        
      case ModuleType.SOLAR:
        for (let i = -3; i <= 3; i+=2) {
          const panelGeo = new THREE.BoxGeometry(8, 0.5, 2);
          const panelMat = new THREE.MeshStandardMaterial({ 
            color: 0x333333,
            emissive: 0x222200
          });
          const panel = new THREE.Mesh(panelGeo, panelMat);
          panel.position.set(i * 1.5, 0, 0);
          panel.rotation.x = Math.PI / 2;
          details.push(panel);
        }
        break;
        
      case ModuleType.TURRET:
        {
          const baseGeo = new THREE.CylinderGeometry(3, 3, 2);
          const barrelGeo = new THREE.BoxGeometry(1, 1, 4);
          const baseMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
          const barrelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
          
          const base = new THREE.Mesh(baseGeo, baseMat);
          base.position.y = 2;
          
          const barrel = new THREE.Mesh(barrelGeo, barrelMat);
          barrel.position.set(0, 2, 2);
          
          details.push(base, barrel);
        }
        break;
    }
    
    return details;
  }
  
  private addConnectorVisuals(group: THREE.Group) {
    const connectorGeo = new THREE.SphereGeometry(1);
    const connectorMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    
    this.connectors.forEach(connector => {
      const sphere = new THREE.Mesh(connectorGeo, connectorMat);
      sphere.position.copy(connector.position.clone().sub(this.position));
      group.add(sphere);
    });
  }
  
  private getModuleColor(): number {
    switch(this.type) {
      case ModuleType.HABITAT: return 0x44aa88;
      case ModuleType.PRODUCTION: return 0xaa8844;
      case ModuleType.STORAGE: return 0x888888;
      case ModuleType.SOLAR: return 0x44aaff;
      case ModuleType.TURRET: return 0xaa4444;
      default: return 0xffffff;
    }
  }
  
  private getBuildRequirements(): ResourceAmount[] {
    switch(this.type) {
      case ModuleType.HABITAT:
        return [
          { type: ResourceType.METAL, amount: 100 },
          { type: ResourceType.SILICON, amount: 50 }
        ];
      case ModuleType.PRODUCTION:
        return [
          { type: ResourceType.METAL, amount: 200 },
          { type: ResourceType.SILICON, amount: 100 },
          { type: ResourceType.RARE, amount: 20 }
        ];
      case ModuleType.SOLAR:
        return [
          { type: ResourceType.METAL, amount: 50 },
          { type: ResourceType.SILICON, amount: 150 }
        ];
      default:
        return [{ type: ResourceType.METAL, amount: 50 }];
    }
  }
  
  canConnectTo(other: StationModule): boolean {
    const distance = this.position.distanceTo(other.position);
    return distance <= 11;
  }
  
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      position: this.position,
      rotation: this.rotation,
      connectors: this.connectors.map(c => ({
        position: c.position,
        direction: c.direction,
        occupied: c.occupied,
        connectedModuleId: c.connectedModuleId
      })),
      resources: this.resources,
      health: this.health
    };
  }
}
