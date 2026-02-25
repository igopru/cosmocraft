// src/types/events.ts
import { ResourceAmount, ModuleType, Vector3D } from './core';

export interface WebSocketMessage {
  type: string;
  data: any;
}

export interface BuildModuleEvent {
  type: ModuleType;
  position: Vector3D;
  connectedTo?: string;
}

export interface MineAsteroidEvent {
  asteroidId: string;
  laserPower: number;
}

export interface MoveEvent {
  position: Vector3D;
  sector: string;
}

export interface GetSectorEvent {
  sectorId: string;
  distance: number;
}

// Ответы сервера
export interface InitData {
  star: any;
  stations: any[];
  asteroidFields: any[];
}

export interface SectorData {
  sector: any;
  asteroids: any[];
  temperature: number;
  radiation: number;
  starDistance: number;
}

export interface DangerData {
  isDangerous: boolean;
  temperature: number;
  radiation: number;
  message: string;
}
