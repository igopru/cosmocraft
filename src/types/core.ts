// src/types/core.ts
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface ResourceAmount {
  type: ResourceType;
  amount: number;
}

export enum ResourceType {
  METAL = 'metal',
  SILICON = 'silicon',
  ICE = 'ice',
  RARE = 'rare'
}

export enum ModuleType {
  HABITAT = 'habitat',
  PRODUCTION = 'production',
  STORAGE = 'storage',
  SOLAR = 'solar',
  TURRET = 'turret'
}

export interface AsteroidTypeConfig {
  color: string;
  resources: Record<string, number>;
  scale: number;
  hardness: number;
  spawnWeight: number;
}

export interface GameConfig {
  star: {
    radius: number;
    temperature: number;
    radiation: number;
    zones: {
      dangerous: number;
      hot: number;
      warm: number;
      cold: number;
    };
  };
  asteroids: {
    spawnRate: number;
    maxPerChunk: number;
    types: Record<string, AsteroidTypeConfig>;
  };
  stations: {
    maxModules: number;
    buildDistance: number;
    moduleCosts: Record<ModuleType, ResourceAmount[]>;
  };
}

export interface PlayerData {
  id: string;
  name: string;
  position: Vector3D;
  sector: string;
  resources: Record<ResourceType, number>;
  modules: string[]; // ID модулей
}
