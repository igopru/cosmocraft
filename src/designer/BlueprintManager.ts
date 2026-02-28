// src/designer/BlueprintManager.ts
import { VoxelType, BlueprintStats } from '../types/voxel';

export interface Blueprint {
  id: string;
  name: string;
  description: string;
  authorId: string;
  size: [number, number, number];
  voxels: Array<{
    x: number;
    y: number;
    z: number;
    type: VoxelType;
    color?: string;
  }>;
  stats: BlueprintStats;
  thumbnail?: string;
  isPublic: boolean;
  downloads: number;
  likes: number;
  createdAt: Date;
}

export class BlueprintManager {
  private static instance: BlueprintManager;
  private blueprints: Map<string, Blueprint> = new Map();
  
  static getInstance(): BlueprintManager {
    if (!BlueprintManager.instance) {
      BlueprintManager.instance = new BlueprintManager();
    }
    return BlueprintManager.instance;
  }
  
  async saveBlueprint(blueprint: Blueprint): Promise<void> {
    // TODO: Сохранить в БД
    this.blueprints.set(blueprint.id, blueprint);
    console.log(`💾 Blueprint saved: ${blueprint.name}`);
  }
  
  async loadBlueprint(id: string): Promise<Blueprint | null> {
    // TODO: Загрузить из БД
    return this.blueprints.get(id) || null;
  }
  
  async getPublicBlueprints(limit: number = 50): Promise<Blueprint[]> {
    // TODO: Получить публичные чертежи из БД
    return Array.from(this.blueprints.values())
      .filter(b => b.isPublic)
      .slice(0, limit);
  }
  
  calculateStats(voxels: Blueprint['voxels']): BlueprintStats {
    const stats: BlueprintStats = {
      powerGeneration: 0,
      powerConsumption: 0,
      cargoCapacity: 0,
      shieldStrength: 0,
      weaponSlots: 0,
      totalHealth: 0,
      voxelCount: voxels.length,
      resourceCost: {
        metal: 0,
        silicon: 0,
        ice: 0,
        rare: 0
      }
    };
    
    for (const voxel of voxels) {
      // Базовая прочность
      stats.totalHealth += this.getVoxelHealth(voxel.type);
      
      // Стоимость
      const cost = this.getVoxelCost(voxel.type);
      stats.resourceCost.metal += cost.metal;
      stats.resourceCost.silicon += cost.silicon;
      stats.resourceCost.ice += cost.ice;
      stats.resourceCost.rare += cost.rare;
      
      // Специальные свойства
      switch(voxel.type) {
        case VoxelType.SOLAR_PANEL:
          stats.powerGeneration += 10;
          break;
        case VoxelType.BATTERY:
          stats.powerConsumption -= 5;
          break;
        case VoxelType.SHIELD_GEN:
          stats.shieldStrength += 50;
          stats.powerConsumption += 10;
          break;
        case VoxelType.CARGO_BAY:
          stats.cargoCapacity += 100;
          break;
        case VoxelType.TURRET_MOUNT:
          stats.weaponSlots += 1;
          break;
      }
    }
    
    return stats;
  }
  
  private getVoxelHealth(type: VoxelType): number {
    const healthMap: Record<VoxelType, number> = {
      [VoxelType.EMPTY]: 0,
      [VoxelType.HULL_LIGHT]: 100,
      [VoxelType.HULL_MEDIUM]: 200,
      [VoxelType.HULL_HEAVY]: 300,
      [VoxelType.HULL_REINFORCED]: 500,
      [VoxelType.SOLAR_PANEL]: 50,
      [VoxelType.BATTERY]: 150,
      [VoxelType.SHIELD_GEN]: 200,
      [VoxelType.THRUSTER]: 120,
      [VoxelType.CARGO_BAY]: 180,
      [VoxelType.TURRET_MOUNT]: 250,
      [VoxelType.DOCKING_PORT]: 300,
      [VoxelType.WINDOW]: 30,
      [VoxelType.LIGHT]: 20,
      [VoxelType.PAINT]: 80
    };
    return healthMap[type] || 100;
  }
  
  private getVoxelCost(type: VoxelType): { metal: number; silicon: number; ice: number; rare: number } {
    const costMap: Record<VoxelType, { metal: number; silicon: number; ice: number; rare: number }> = {
      [VoxelType.EMPTY]: { metal: 0, silicon: 0, ice: 0, rare: 0 },
      [VoxelType.HULL_LIGHT]: { metal: 5, silicon: 0, ice: 0, rare: 0 },
      [VoxelType.HULL_MEDIUM]: { metal: 10, silicon: 2, ice: 0, rare: 0 },
      [VoxelType.HULL_HEAVY]: { metal: 20, silicon: 5, ice: 0, rare: 1 },
      [VoxelType.HULL_REINFORCED]: { metal: 30, silicon: 10, ice: 5, rare: 2 },
      [VoxelType.SOLAR_PANEL]: { metal: 5, silicon: 10, ice: 0, rare: 0 },
      [VoxelType.BATTERY]: { metal: 10, silicon: 5, ice: 0, rare: 1 },
      [VoxelType.SHIELD_GEN]: { metal: 20, silicon: 15, ice: 0, rare: 5 },
      [VoxelType.THRUSTER]: { metal: 15, silicon: 5, ice: 0, rare: 2 },
      [VoxelType.CARGO_BAY]: { metal: 25, silicon: 10, ice: 0, rare: 1 },
      [VoxelType.TURRET_MOUNT]: { metal: 30, silicon: 15, ice: 0, rare: 5 },
      [VoxelType.DOCKING_PORT]: { metal: 40, silicon: 20, ice: 10, rare: 5 },
      [VoxelType.WINDOW]: { metal: 2, silicon: 5, ice: 0, rare: 0 },
      [VoxelType.LIGHT]: { metal: 1, silicon: 2, ice: 0, rare: 0 },
      [VoxelType.PAINT]: { metal: 1, silicon: 1, ice: 0, rare: 0 }
    };
    return costMap[type];
  }
}
