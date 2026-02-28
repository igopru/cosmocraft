// src/types/voxel.ts
export enum VoxelType {
  // Структурные
  EMPTY = 'empty',
  HULL_LIGHT = 'hull_light',     // легкий корпус
  HULL_MEDIUM = 'hull_medium',   // средний корпус  
  HULL_HEAVY = 'hull_heavy',     // тяжелый корпус
  HULL_REINFORCED = 'hull_reinforced', // усиленный
  
  // Функциональные
  SOLAR_PANEL = 'solar_panel',   // солнечная панель
  BATTERY = 'battery',           // аккумулятор
  SHIELD_GEN = 'shield_gen',      // генератор щита
  THRUSTER = 'thruster',         // двигатель
  CARGO_BAY = 'cargo_bay',       // грузовой отсек
  TURRET_MOUNT = 'turret_mount',  // крепление для турели
  DOCKING_PORT = 'docking_port',   // стыковочный узел
  
  // Декоративные
  WINDOW = 'window',              // окно
  LIGHT = 'light',                // свет
  PAINT = 'paint'                 // краска (разные цвета)
}

export interface VoxelData {
  type: VoxelType;
  color?: string;                  // для краски
  rotation?: number;               // поворот (0-3)
  health?: number;                 // прочность
}

export interface BlueprintStats {
  powerGeneration: number;
  powerConsumption: number;
  cargoCapacity: number;
  shieldStrength: number;
  weaponSlots: number;
  totalHealth: number;
  voxelCount: number;
  resourceCost: Record<string, number>;
}
