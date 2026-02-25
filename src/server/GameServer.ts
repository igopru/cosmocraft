// src/server/GameServer.ts
import { dbConfig, serverConfig } from '../config/db.config';
import WebSocket, { WebSocketServer } from 'ws';
import { DatabaseManager } from './storage/DatabaseManager';
import { LotkaVolterraGenerator } from '../world/LotkaVolterraGenerator';
import * as crypto from 'crypto';

export class GameServer {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocket> = new Map();
  private db: DatabaseManager;
  private worldGenerator: LotkaVolterraGenerator;
  private currentWorld: any = null;
  
  constructor() {
    this.db = new DatabaseManager();
    this.worldGenerator = new LotkaVolterraGenerator(dbConfig);
    this.wss = new WebSocketServer({ port: serverConfig.port });
    
    this.initialize();
    this.setupWebSocket();
    
    console.log('🚀 Game server started on port 8080');
  }
  
  private async initialize() {
    // Проверяем, есть ли активный мир
    this.currentWorld = await this.db.getActiveWorld();
    
    if (!this.currentWorld) {
      console.log('🌍 Активный мир не найден, создаем новый...');
      this.currentWorld = await this.worldGenerator.createNewWorld(0);
    } else {
      console.log(`🌍 Текущий мир: #${this.currentWorld.world_number} (${this.currentWorld.name})`);
    }
  }
  
  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      const clientId = crypto.randomBytes(16).toString('hex');
      this.clients.set(clientId, ws);
      
      console.log(`👤 Client connected: ${clientId}`);
      
      // Отправляем информацию о текущем мире
      ws.send(JSON.stringify({
        type: 'init',
        data: {
          world: this.currentWorld,
          message: 'Добро пожаловать в CosmoCraft!'
        }
      }));
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(clientId, message);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });
      
      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`👋 Client disconnected: ${clientId}`);
      });
    });
  }
  
    private async handleMessage(clientId: string, message: any) {
      console.log(`📨 Получено сообщение от ${clientId}:`, message.type);
      switch(message.type) {
        case 'getAsteroids':
          await this.handleGetAsteroids(clientId, message.data);
          break;
        case 'updatePosition':
          await this.handleUpdatePosition(clientId, message.data);
          break;
        case 'mineAsteroid':
          await this.handleMineAsteroid(clientId, message.data);
          break;
        case 'getWorldInfo':
          await this.handleGetWorldInfo(clientId);
          break;
        default:
          console.log('❌ Неизвестный тип сообщения:', message.type);
          // Не закрываем соединение, просто логируем
      }
  }
  
  private async handleGetAsteroids(clientId: string, data: any) {
    const { position, radius = 500 } = data;
    
    const asteroids = await this.db.getAsteroidsInRange(
      position.x, position.y, position.z, radius
    );
    
    this.clients.get(clientId)?.send(JSON.stringify({
      type: 'asteroidsData',
      data: asteroids
    }));
  }
  
  private async handleUpdatePosition(clientId: string, data: any) {
    const { position, sector } = data;
    
    // Получаем или создаем игрока
    let player = await this.db.getPlayer(clientId);
    
    if (!player) {
      // Новый игрок
      player = {
        id: clientId,
        username: `Player_${clientId.substring(0, 4)}`,
        position_x: position.x,
        position_y: position.y,
        position_z: position.z,
        current_sector_id: sector
      };
      
      await this.db.savePlayer(clientId, {
        name: player.username,
        sector,
        position,
        resources: { metal: 1000, silicon: 500, ice: 300, rare: 100 }
      });
    } else {
      // Обновляем позицию
      await this.db.savePlayer(clientId, {
        name: player.username,
        sector,
        position,
        resources: JSON.parse(player.resources || '{}')
      });
    }
    
    // Обновляем прогресс в мире
    await this.db.updateWorldProgress(clientId, this.currentWorld.id, {
      distanceTraveled: Math.abs(position.x + position.y + position.z)
    });
  }
  
  private async handleMineAsteroid(clientId: string, data: any) {
    const { asteroidId, laserPower } = data;
    
    // Здесь будет логика добычи
    this.clients.get(clientId)?.send(JSON.stringify({
      type: 'miningResult',
      data: { success: true, message: 'Добыча начата' }
    }));
  }
 
  private async handleGetWorldInfo(clientId: string) {
    try {
      const playerLegacy = await this.db.getPlayerLegacy(clientId);
      this.clients.get(clientId)?.send(JSON.stringify({
        type: 'worldInfo',
        data: {
          currentWorld: this.currentWorld,
          playerLegacy: playerLegacy || { prestige_level: 1, total_worlds_completed: 0 }
        }
      }));
    } catch (error) {
      console.error('Ошибка в getWorldInfo:', error);
    }
  }
}

// Запуск сервера
new GameServer();
