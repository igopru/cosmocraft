// src/server/storage/PlayerStorage.ts
import * as fs from 'fs';
import * as path from 'path';
import { PlayerData, ResourceType } from '../../types/core';

export class PlayerStorage {
  private playersPath: string;
  
  constructor(playersPath: string) {
    this.playersPath = playersPath;
    this.ensureDirectory();
  }
  
  private ensureDirectory() {
    if (!fs.existsSync(this.playersPath)) {
      fs.mkdirSync(this.playersPath, { recursive: true });
    }
  }
  
  loadPlayer(playerId: string): PlayerData {
    const filePath = path.join(this.playersPath, `${playerId}.json`);
    
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
    
    // Создаем нового игрока
    return {
      id: playerId,
      name: 'Player',
      position: { x: 0, y: 0, z: 500 },
      sector: 'sector_1',
      resources: {
        [ResourceType.METAL]: 1000,
        [ResourceType.SILICON]: 500,
        [ResourceType.ICE]: 300,
        [ResourceType.RARE]: 100
      },
      modules: []
    };
  }
  
  savePlayer(playerId: string, playerData: PlayerData) {
    const filePath = path.join(this.playersPath, `${playerId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(playerData, null, 2));
  }
  
  deletePlayer(playerId: string) {
    const filePath = path.join(this.playersPath, `${playerId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  
  getAllPlayers(): PlayerData[] {
    const files = fs.readdirSync(this.playersPath)
      .filter(f => f.endsWith('.json'));
    
    return files.map(file => {
      const data = fs.readFileSync(path.join(this.playersPath, file), 'utf-8');
      return JSON.parse(data);
    });
  }
}
