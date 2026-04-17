// src/server/GameServer.ts
import { dbConfig, serverConfig } from '../config/db.config';
import WebSocket, { WebSocketServer } from 'ws';
import { DatabaseManager } from './storage/DatabaseManager';
import { LotkaVolterraGenerator } from '../world/LotkaVolterraGenerator';
import { PlayerManager } from './utils/PlayerManager';
import { initAdminRoutes } from './routes/admin.routes';
import { initMissionRoutes } from './routes/mission.routes';
import { router as authRouter } from './routes/auth.routes';
import { StationTradeService } from './services/StationTradeService';
import { ECONOMY } from '../shared/Economy';
import { logBalanceLoad } from './utils/TradeLogger';
import * as crypto from 'crypto';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';

// Используем process.cwd() для корректной работы при запуске через ts-node
const baseDir = process.cwd();
const publicPath = path.join(baseDir, 'public');
const sharedStationPath = path.join(baseDir, 'stations', 'shared');

/**
 * Вычисляет минимальное расстояние астероидов от звезды
 * Загружает blueprint станции и считает: орбита = 4*размер + 1*размер буфер
 */
async function computeMinAsteroidDistance(): Promise<number> {
  const stationDir = path.join(baseDir, 'station');
  const blueprintPath = path.join(stationDir, 'SolarWheel_Pro.blueprint.json');

  if (!fs.existsSync(blueprintPath)) {
    console.log('⚠️ Blueprint не найден, используем умолчание 2000');
    return 2000;
  }

  try {
    const bp = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));
    const voxels = bp.voxels;
    const gridSize = bp.gridSize || 64;
    const voxelSize = 6;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const v of voxels) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }

    const dx = (maxX - minX + 1) * voxelSize;
    const dy = (maxY - minY + 1) * voxelSize;
    const dz = (maxZ - minZ + 1) * voxelSize;
    const stationSize = Math.max(dx, dy, dz);
    const orbitRadius = stationSize * 4;
    const minDist = orbitRadius + stationSize;

    console.log(`🛰️ Station: ${dx.toFixed(0)}x${dy.toFixed(0)}x${dz.toFixed(0)}, orbit=${orbitRadius}, minAsteroid=${minDist}`);
    return Math.ceil(minDist);
  } catch (e) {
    console.error('❌ Ошибка вычисления расстояния станции:', e);
    return 2000;
  }
}
const playerBasePath = path.join(baseDir, 'players');
const adminPath = path.join(baseDir, 'public', 'admin');

export class GameServer {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocket> = new Map();
  private db: DatabaseManager;
  private playerManager: PlayerManager;
  private worldGenerator: LotkaVolterraGenerator;
  private tradeService: StationTradeService;
  private currentWorld: any = null;
  private app: any;
  private minAsteroidDist: number = 2000;
  // Маппинг clientId -> playerIndex
  private clientToPlayer: Map<string, string> = new Map();

  constructor() {
    this.db = new DatabaseManager();
    this.playerManager = new PlayerManager(this.db, playerBasePath);
    this.worldGenerator = new LotkaVolterraGenerator(dbConfig);
    this.tradeService = new StationTradeService(this.db);

    // Вычисляем минимальное расстояние астероидов на основе blueprint станции
    computeMinAsteroidDistance().then(dist => {
      this.minAsteroidDist = dist;
      this.worldGenerator.setMinAsteroidDist(dist);
    });
    // Запускаем WebSocket сервер на всех интерфейсах (0.0.0.0)
    this.wss = new WebSocketServer({ port: serverConfig.port, host: '0.0.0.0' });

    console.log('🔌 WebSocket server created on port', serverConfig.port);

    // Настраиваем Express
    this.app = express();
    this.app.use(express.json());

    // Создаём папки
    this.ensureFolders();

    // Регистрируем API
    this.setupAPI();

    // Запускаем сервер
    this.startServer();

    // Инициализируем мир
    console.log('🌍 Инициализация мира...');
    this.initialize().then(() => {
      console.log('✅ Мир инициализирован');
      // Настраиваем WebSocket
      this.setupWebSocket();
      console.log('🔌 WebSocket handlers setup complete');
      
      // Удерживаем процесс активным
      setInterval(() => {}, 60000);
      console.log('⏰ Process keep-alive interval started');
    }).catch(err => {
      console.error('❌ Ошибка инициализации мира:', err);
      process.exit(1);
    });

    console.log('🚀 Game server started on port 8080');
  }

  private ensureFolders() {
    if (!fs.existsSync(sharedStationPath)) {
      fs.mkdirSync(sharedStationPath, { recursive: true });
      console.log(`📁 Папка для общих станций: ${sharedStationPath}`);
    }
    if (!fs.existsSync(playerBasePath)) {
      fs.mkdirSync(playerBasePath, { recursive: true });
      console.log(`📁 Базовая папка для игроков: ${playerBasePath}`);
    }
  }

  private setupAPI() {
    // API для получения конфигурации пилотирования
    this.app.get('/api/pilot-config', (req: any, res: any) => {
      const config = (global as any).PILOT_CONFIG || {};
      res.json(config);
    });

    // ===== Маршруты списка станций/кораблей игрока (ДО setupStationRoutes!) =====
    // GET /api/stations/player — список станций игрока
    this.app.get('/api/stations/player', async (req: any, res: any) => {
      try {
        const playerName = req.headers['x-player-name'] || req.query.playerId;
        if (!playerName) return res.status(400).json({ error: 'Нужен playerId' });
        const { playerIndex } = await this.playerManager.getOrCreatePlayer(playerName);
        const playerFolder = this.playerManager.getPlayerFolder(playerIndex);
        const stationDir = path.join(playerFolder, 'station');
        const sharedStationPath2 = path.join(baseDir, 'stations', 'shared');
        let stations: {name: string; type: string}[] = [];
        // Личные станции
        if (fs.existsSync(stationDir)) {
          const files = fs.readdirSync(stationDir).filter(f => f.endsWith('.blueprint.json'));
          stations.push(...files.map(f => ({ name: f.replace('.blueprint.json', ''), type: 'personal' })));
        }
        // Общие станции
        if (fs.existsSync(sharedStationPath2)) {
          const files = fs.readdirSync(sharedStationPath2).filter(f => f.endsWith('.blueprint.json'));
          stations.push(...files.map(f => ({ name: f.replace('.blueprint.json', ''), type: 'shared' })));
        }
        // Базовая станция звезды
        stations.push({ name: 'Базовая станция звезды', type: 'base' });
        res.json({ stations });
      } catch (e: any) {
        console.error('❌ /api/stations/player error:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // GET /api/ships/player — список кораблей игрока
    this.app.get('/api/ships/player', async (req: any, res: any) => {
      try {
        const playerName = req.headers['x-player-name'] || req.query.playerId;
        if (!playerName) return res.status(400).json({ error: 'Нужен playerId' });
        const { playerIndex } = await this.playerManager.getOrCreatePlayer(playerName);
        const playerFolder = this.playerManager.getPlayerFolder(playerIndex);
        const planeDir = path.join(playerFolder, 'plane');
        let ships: {name: string}[] = [];
        if (fs.existsSync(planeDir)) {
          const files = fs.readdirSync(planeDir).filter(f => f.endsWith('.blueprint.json'));
          ships = files.map(f => ({ name: f.replace('.blueprint.json', '') }));
        }
        res.json({ ships });
      } catch (e: any) {
        console.error('❌ /api/ships/player error:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // ===== Маршруты торговли на станции (регистрирует /api/stations/:name!) =====
    this.setupStationRoutes();

    // GET /api/stations - список всех станций (личные + общие)
    this.app.get('/api/stations', async (req: any, res: any) => {
      try {
        const playerName = req.query.playerName as string || 'default';
        
        // Получаем или создаём игрока
        const { playerIndex } = await this.playerManager.getOrCreatePlayer(playerName);
        
        // Личные станции игрока
        const personalStations = await this.playerManager.getPlayerStations(playerIndex);

        // Общие станции
        let sharedStations: Array<{ name: string; type: 'shared' }> = [];
        if (fs.existsSync(sharedStationPath)) {
          const files = fs.readdirSync(sharedStationPath);
          sharedStations = files
            .filter((f: string) => f.endsWith('.blueprint.json'))
            .map((f: string) => ({ name: f.replace('.blueprint.json', ''), type: 'shared' }));
        }

        res.json({
          personal: personalStations,
          shared: sharedStations,
          all: [...personalStations, ...sharedStations]
        });
      } catch (error: any) {
        console.error('Ошибка получения станций:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/stations - сохранение новой модели
    this.app.post('/api/stations', async (req: any, res: any) => {
      try {
        const { name, data, isShared } = req.body;
        const playerName = req.body.playerName || 'default';

        if (!name || !data) {
          return res.status(400).json({ error: 'Нет имени или данных' });
        }

        const { playerIndex } = await this.playerManager.getOrCreatePlayer(playerName);

        if (isShared) {
          // Сохраняем в общие
          const filename = `${name.replace(/[^a-z0-9]/gi, '_')}.blueprint.json`;
          const savePath = path.join(sharedStationPath, filename);

          if (fs.existsSync(savePath)) {
            return res.status(409).json({ error: 'Модель с таким именем уже существует', exists: true });
          }

          fs.writeFileSync(savePath, JSON.stringify(data, null, 2));
          console.log(`💾 Модель сохранена как общая: ${filename}`);
          res.json({ success: true, filename, isShared: true });
        } else {
          // Сохраняем в личную папку
          const result = await this.playerManager.savePlayerStation(playerIndex, name, data);
          if (!result.success) {
            return res.status(400).json({ error: result.error });
          }
          res.json({ success: true, isShared: false });
        }
      } catch (error: any) {
        console.error('Ошибка сохранения станции:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // PUT /api/stations/:name - обновление существующей модели
    this.app.put('/api/stations/:name', async (req: any, res: any) => {
      try {
        const { name } = req.params;
        const { data } = req.body;
        const playerName = req.body.playerName || 'default';

        const { playerIndex } = await this.playerManager.getOrCreatePlayer(playerName);
        const playerFolder = this.playerManager.getPlayerFolder(playerIndex);
        const filename = `${name.replace(/[^a-z0-9]/gi, '_')}.blueprint.json`;
        const filepath = path.join(playerFolder, filename);

        if (!fs.existsSync(filepath)) {
          return res.status(404).json({ error: 'Модель не найдена' });
        }

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`💾 Модель обновлена: ${filename}`);
        res.json({ success: true });
      } catch (error: any) {
        console.error('Ошибка обновления станции:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/stations/:name - удаление модели
    this.app.delete('/api/stations/:name', async (req: any, res: any) => {
      try {
        const { name } = req.params;
        const playerName = req.query.playerName as string || 'default';

        const { playerIndex } = await this.playerManager.getOrCreatePlayer(playerName);
        const result = await this.playerManager.deletePlayerStation(playerIndex, name);
        
        if (!result.success) {
          return res.status(404).json({ error: result.error });
        }
        
        res.json({ success: true });
      } catch (error: any) {
        console.error('Ошибка удаления станции:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/player/login - вход игрока
    this.app.post('/api/player/login', async (req: any, res: any) => {
      try {
        const { playerName } = req.body;

        if (!playerName) {
          return res.status(400).json({ error: 'Имя игрока обязательно' });
        }

        const { playerId, playerIndex, isNew } = await this.playerManager.getOrCreatePlayer(playerName);

        res.json({
          success: true,
          playerId,
          playerIndex,
          playerName,
          isNew,
          message: isNew ? 'Добро пожаловать!' : 'С возвращением!'
        });
      } catch (error: any) {
        console.error('Ошибка входа игрока:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/player/:playerIndex/info - информация об игроке
    this.app.get('/api/player/:playerIndex/info', async (req: any, res: any) => {
      try {
        const { playerIndex } = req.params;
        const playerInfo = await this.playerManager.getPlayerInfo(playerIndex);

        if (!playerInfo) {
          return res.status(404).json({ error: 'Игрок не найден' });
        }

        res.json({ player: playerInfo });
      } catch (error: any) {
        console.error('Ошибка получения информации об игроке:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/ships - сохранение корабля в папку players/ID/plane
    this.app.post('/api/ships', async (req: any, res: any) => {
      try {
        const { name, data, playerName } = req.body;

        if (!name || !data) {
          return res.status(400).json({ error: 'Нет имени или данных' });
        }

        const player = playerName || 'default';
        const { playerIndex } = await this.playerManager.getOrCreatePlayer(player);
        const playerFolder = this.playerManager.getPlayerFolder(playerIndex);

        // Создаём папку plane если не существует
        const planeFolder = path.join(playerFolder, 'plane');
        if (!fs.existsSync(planeFolder)) {
          fs.mkdirSync(planeFolder, { recursive: true });
          console.log(`📁 Создана папка для кораблей: ${planeFolder}`);
        }

        const filename = `${name.replace(/[^a-z0-9]/gi, '_')}.blueprint.json`;
        const filepath = path.join(planeFolder, filename);

        if (fs.existsSync(filepath)) {
          return res.status(409).json({ error: 'Корабль с таким именем уже существует', exists: true });
        }

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`💾 Корабль сохранён: ${filepath}`);
        res.json({ success: true, filename, path: 'plane' });
      } catch (error: any) {
        console.error('Ошибка сохранения корабля:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/stations/save - сохранение станции в папку players/ID/station
    this.app.post('/api/stations/save', async (req: any, res: any) => {
      try {
        const { name, data, playerName } = req.body;

        if (!name || !data) {
          return res.status(400).json({ error: 'Нет имени или данных' });
        }

        const player = playerName || 'default';
        const { playerIndex } = await this.playerManager.getOrCreatePlayer(player);
        const playerFolder = this.playerManager.getPlayerFolder(playerIndex);

        // Создаём папку station если не существует
        const stationFolder = path.join(playerFolder, 'station');
        if (!fs.existsSync(stationFolder)) {
          fs.mkdirSync(stationFolder, { recursive: true });
          console.log(`📁 Создана папка для станций: ${stationFolder}`);
        }

        const filename = `${name.replace(/[^a-z0-9]/gi, '_')}.blueprint.json`;
        const filepath = path.join(stationFolder, filename);

        if (fs.existsSync(filepath)) {
          return res.status(409).json({ error: 'Станция с таким именем уже существует', exists: true });
        }

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`💾 Станция сохранена: ${filepath}`);
        res.json({ success: true, filename, path: 'station' });
      } catch (error: any) {
        console.error('Ошибка сохранения станции:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // PUT /api/ships/:name - обновление корабля
    this.app.put('/api/ships/:name', async (req: any, res: any) => {
      try {
        const { name } = req.params;
        const { data, playerName } = req.body;

        const player = playerName || 'default';
        const { playerIndex } = await this.playerManager.getOrCreatePlayer(player);
        const playerFolder = this.playerManager.getPlayerFolder(playerIndex);
        const planeFolder = path.join(playerFolder, 'plane');
        const filename = `${name.replace(/[^a-z0-9]/gi, '_')}.blueprint.json`;
        const filepath = path.join(planeFolder, filename);

        if (!fs.existsSync(filepath)) {
          return res.status(404).json({ error: 'Корабль не найден' });
        }

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`💾 Корабль обновлён: ${filepath}`);
        res.json({ success: true });
      } catch (error: any) {
        console.error('Ошибка обновления корабля:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // PUT /api/stations/save/:name - обновление станции
    this.app.put('/api/stations/save/:name', async (req: any, res: any) => {
      try {
        const { name } = req.params;
        const { data, playerName } = req.body;

        const player = playerName || 'default';
        const { playerIndex } = await this.playerManager.getOrCreatePlayer(player);
        const playerFolder = this.playerManager.getPlayerFolder(playerIndex);
        const stationFolder = path.join(playerFolder, 'station');
        const filename = `${name.replace(/[^a-z0-9]/gi, '_')}.blueprint.json`;
        const filepath = path.join(stationFolder, filename);

        if (!fs.existsSync(filepath)) {
          return res.status(404).json({ error: 'Станция не найдена' });
        }

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`💾 Станция обновлена: ${filepath}`);
        res.json({ success: true });
      } catch (error: any) {
        console.error('Ошибка обновления станции:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Админ-панель маршруты
    const jwtSecret = process.env.JWT_ACCESS_SECRET || 'default_secret_change_in_production';
    const adminRoutes = initAdminRoutes(this.db, jwtSecret);

    // Логирование запросов (безопасный вариант — setImmediate)
    const dbRef = this.db;
    this.app.use((req: any, res: any, next: Function) => {
      const startTime = Date.now();
      res.on('finish', () => {
        setImmediate(() => {
          try {
            const url = req.url || '';
            if (res.statusCode < 400 && !url.startsWith('/api/admin') && !url.startsWith('/api/auth') && !url.startsWith('/api/missions')) return;
            const ip = (req.ip || req.socket?.remoteAddress || 'unknown').toString();
            const port = req.socket?.localPort || 0;
            const protocol = port === 8080 ? 'ws' : 'http';
            const ua = (req.headers['user-agent'] || '').toString().substring(0, 500);
            dbRef.execute(
              'INSERT INTO port_access_log (ip_address, port, protocol, path, status_code, user_agent, request_method, response_time_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [ip, port, protocol, url.substring(0, 255), res.statusCode, ua, req.method || 'GET', Date.now() - startTime]
            ).catch(() => {});
          } catch (_e) { /* ignore */ }
        });
      });
      next();
    });

    this.app.use('/api/admin', adminRoutes);

    // Маршруты заданий (требуют аутентификации пилота)
    const missionRoutes = initMissionRoutes(this.db);
    this.app.use('/api/missions', missionRoutes);

    // Маршруты авторизации (регистрация, вход, восстановление пароля)
    this.app.use('/api/auth', authRouter);
    this.db; // Сохраняем экземпляр БД для доступа из auth routes

    // ===== Маршруты торговли на станции =====
    this.setupStationRoutes();

    // Статические файлы админ-панели
    this.app.use('/admin', express.static(adminPath));

    // Статические файлы станций (blueprint JSON)
    const stationDir = path.join(baseDir, 'station');
    if (fs.existsSync(stationDir)) {
      this.app.use('/station', express.static(stationDir));
    }

    // Раздача статических файлов - ПОСЛЕ API маршрутов!
    this.app.use(express.static(publicPath));

    console.log('📁 API endpoints registered:');
    console.log('   - GET  /api/pilot-config');
    console.log('   - GET  /api/stations');
    console.log('   - GET  /api/stations/:name');
    console.log('   - POST /api/stations');
    console.log('   - PUT  /api/stations/:name');
    console.log('   - DELETE /api/stations/:name');
    console.log('   - POST /api/player/login');
    console.log('   - GET  /api/player/:playerIndex/info');
    console.log('   - POST /api/auth/register     (Регистрация)');
    console.log('   - POST /api/auth/login        (Вход)');
    console.log('   - POST /api/auth/logout       (Выход)');
    console.log('   - POST /api/auth/refresh      (Обновление токена)');
    console.log('   - POST /api/auth/forgot-password');
    console.log('   - POST /api/auth/reset-password');
    console.log('   - POST /api/auth/verify-email');
    console.log('   - GET  /api/auth/me');
    console.log('   - POST /api/admin/login');
    console.log('   - GET  /api/admin/* (Admin API)');
    console.log('   - GET  /admin (Admin Panel UI)');
  }

  private startServer() {
    // Запускаем Express на всех интерфейсах (0.0.0.0)
    this.app.listen(serverConfig.clientPort, '0.0.0.0', () => {
      console.log(`📁 Static server started on port ${serverConfig.clientPort}`);
      console.log(`📁 Serving files from: ${publicPath}`);
      console.log(`📁 Station path: ${sharedStationPath}`);
    });
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
    // console.log(`📨 Получено сообщение от ${clientId}:`, message.type);
    
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
      case 'playerLogin':
        await this.handlePlayerLogin(clientId, message.data);
        break;
      case 'syncCargo':
        await this.handleSyncCargo(clientId, message.data);
        break;
      default:
        console.log('❌ Неизвестный тип сообщения:', message.type);
    }
  }

  // ===== Маршруты торговли на станции =====
  private setupStationRoutes() {
    const trade = this.tradeService;

    // POST /api/station/sell — продать ресурс
    this.app.post('/api/station/sell', async (req: any, res: any) => {
      try {
        const playerId = req.headers['x-player-name'] || req.body.playerId;
        if (!playerId) return res.status(400).json({ error: 'Нужен playerId' });
        const { resource, amount } = req.body;
        if (!resource || !amount) return res.status(400).json({ error: 'Нужны resource и amount' });
        const result = await trade.sellResource(playerId as string, resource, Number(amount));
        res.json(result);
      } catch (e: any) {
        console.error('❌ /api/station/sell error:', e);
        res.status(500).json({ success: false, message: `Ошибка сервера: ${e.message}` });
      }
    });

    // POST /api/station/sync-cargo — обновить cargo на сервере (только если клиент больше сервера)
    this.app.post('/api/station/sync-cargo', async (req: any, res: any) => {
      try {
        const playerId = req.headers['x-player-name'] || req.body.playerId;
        if (!playerId) return res.status(400).json({ error: 'Нужен playerId' });
        const { cargo } = req.body;
        if (!cargo) return res.status(400).json({ error: 'Нужен cargo' });

        // Загружаем текущий cargo из БД
        const [rows] = await this.db.execute(
          'SELECT cargo_json FROM players WHERE username = ? LIMIT 1',
          [playerId]
        ) as any;

        let dbCargo = { metal: 0, silicon: 0, ice: 0, rare: 0, fuel: 0, water: 0 };
        if (rows.length > 0 && rows[0].cargo_json) {
          dbCargo = typeof rows[0].cargo_json === 'string' ? JSON.parse(rows[0].cargo_json) : rows[0].cargo_json;
        }

        // Обновляем ТОЛЬКО если клиент больше сервера (новые ресурсы от мининга)
        const merged = {
          metal: Math.max(dbCargo.metal || 0, cargo.metal || 0),
          silicon: Math.max(dbCargo.silicon || 0, cargo.silicon || 0),
          ice: Math.max(dbCargo.ice || 0, cargo.ice || 0),
          rare: Math.max(dbCargo.rare || 0, cargo.rare || 0),
          fuel: Math.max(dbCargo.fuel || 0, cargo.fuel || 0),
          water: Math.max(dbCargo.water || 0, cargo.water || 0),
        };

        await this.db.execute(
          'UPDATE players SET cargo_json = ? WHERE username = ?',
          [JSON.stringify(merged), playerId]
        );
        res.json({ success: true, cargo: merged });
      } catch (e: any) {
        console.error('❌ /api/station/sync-cargo error:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // GET /api/station/cargo — загрузить cargo из БД
    this.app.get('/api/station/cargo', async (req: any, res: any) => {
      try {
        const playerId = req.headers['x-player-name'] || req.query.playerId;
        if (!playerId) return res.status(400).json({ error: 'Нужен playerId' });
        const [rows] = await this.db.execute(
          'SELECT cargo_json FROM players WHERE username = ? LIMIT 1',
          [playerId]
        ) as any;
        if (rows.length === 0 || !rows[0].cargo_json) {
          return res.json({ cargo: { metal: 0, silicon: 0, ice: 0, rare: 0, fuel: 0, water: 0 } });
        }
        const cargo = typeof rows[0].cargo_json === 'string' ? JSON.parse(rows[0].cargo_json) : rows[0].cargo_json;
        res.json({ cargo });
      } catch (e: any) {
        console.error('❌ /api/station/cargo error:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // GET /api/stations/:name — загрузить blueprint станции
    this.app.get('/api/stations/:name', async (req: any, res: any) => {
      try {
        const { name } = req.params;
        const playerName = req.headers['x-player-name'] || req.query.playerId;
        if (!playerName) return res.status(400).json({ error: 'Нужен playerId' });
        const { playerIndex } = await this.playerManager.getOrCreatePlayer(playerName);
        const playerFolder = this.playerManager.getPlayerFolder(playerIndex);
        const stationDir = path.join(playerFolder, 'station');
        const sharedStationPath2 = path.join(baseDir, 'stations', 'shared');
        // Проверяем личные
        const personalPath = path.join(stationDir, `${name}.blueprint.json`);
        if (fs.existsSync(personalPath)) {
          const data = JSON.parse(fs.readFileSync(personalPath, 'utf-8'));
          return res.json({ ...data, type: 'personal' });
        }
        // Проверяем общие
        const sharedPath = path.join(sharedStationPath2, `${name}.blueprint.json`);
        if (fs.existsSync(sharedPath)) {
          const data = JSON.parse(fs.readFileSync(sharedPath, 'utf-8'));
          return res.json({ ...data, type: 'shared' });
        }
        // Базовая станция
        if (name === 'Базовая станция звезды' || name === 'SolarWheel_Pro') {
          const basePath = path.join(baseDir, 'station', 'SolarWheel_Pro.blueprint.json');
          if (fs.existsSync(basePath)) {
            const data = JSON.parse(fs.readFileSync(basePath, 'utf-8'));
            return res.json({ ...data, type: 'base' });
          }
        }
        res.status(404).json({ error: 'Станция не найдена' });
      } catch (e: any) {
        console.error('❌ GET /api/stations/:name error:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // GET /api/ships/:name — загрузить blueprint корабля
    this.app.get('/api/ships/:name', async (req: any, res: any) => {
      try {
        const { name } = req.params;
        const playerName = req.headers['x-player-name'] || req.query.playerId;
        if (!playerName) return res.status(400).json({ error: 'Нужен playerId' });
        const { playerIndex } = await this.playerManager.getOrCreatePlayer(playerName);
        const playerFolder = this.playerManager.getPlayerFolder(playerIndex);
        const planeDir = path.join(playerFolder, 'plane');
        const shipPath = path.join(planeDir, `${name}.blueprint.json`);
        if (!fs.existsSync(shipPath)) return res.status(404).json({ error: 'Корабль не найден' });
        const data = JSON.parse(fs.readFileSync(shipPath, 'utf-8'));
        res.json(data);
      } catch (e: any) {
        console.error('❌ GET /api/ships/:name error:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // POST /api/station/buy — купить ресурс
    this.app.post('/api/station/buy', async (req: any, res: any) => {
      try {
        const playerId = req.headers['x-player-name'] || req.body.playerId;
        if (!playerId) return res.status(400).json({ error: 'Нужен playerId' });
        const { resource, amount, cargo } = req.body;
        if (!resource || !amount) return res.status(400).json({ error: 'Нужны resource и amount' });
        const result = await trade.buyResource(playerId as string, resource, Number(amount), cargo);
        res.json(result);
      } catch (e: any) {
        console.error('❌ /api/station/buy error:', e);
        res.status(500).json({ success: false, message: `Ошибка сервера: ${e.message}` });
      }
    });

    // POST /api/station/service — получить услугу
    this.app.post('/api/station/service', async (req: any, res: any) => {
      try {
        const playerId = req.headers['x-player-name'] || req.body.playerId;
        if (!playerId) return res.status(400).json({ error: 'Нужен playerId' });
        const { service, amount } = req.body;
        if (!service || !amount) return res.status(400).json({ error: 'Нужны service и amount' });
        const result = await trade.getService(playerId as string, service, Number(amount));
        res.json(result);
      } catch (e: any) {
        console.error('❌ /api/station/service error:', e);
        res.status(500).json({ success: false, message: `Ошибка сервера: ${e.message}` });
      }
    });

    // GET /api/station/balance — баланс пилота
    this.app.get('/api/station/balance', async (req: any, res: any) => {
      try {
        const playerId = req.headers['x-player-name'] || req.query.playerId;
        if (!playerId) return res.status(400).json({ error: 'Нужен playerId или X-Player-Name' });
        const balance = await trade.getBalance(playerId as string);
        res.json({ balance, currency: 'Cred' });
      } catch (e: any) {
        console.error('❌ /api/station/balance error:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // GET /api/station/pricelist — прайс-лист
    this.app.get('/api/station/pricelist', (_req: any, res: any) => {
      res.json({ prices: ECONOMY.prices, bulkDiscount: { threshold: ECONOMY.bulkDiscountThreshold, percent: ECONOMY.bulkDiscountPercent } });
    });

    console.log('   - GET   /api/station/balance');
    console.log('   - POST  /api/station/sell');
    console.log('   - POST  /api/station/buy');
    console.log('   - POST  /api/station/service');
    console.log('   - GET   /api/station/pricelist');
  }

  private async handleGetAsteroids(clientId: string, data: any) {
    const { position, radius = 500 } = data;

    // Проверяем, что позиция корректна
    if (!position || position.x === undefined || position.y === undefined || position.z === undefined) {
      console.warn(`⚠️ Некорректная позиция от клиента ${clientId}:`, position);
      return;
    }

    const asteroids = await this.db.getAsteroidsInRange(
      position.x, position.y, position.z, radius, this.minAsteroidDist
    );

    const asteroidsArray = asteroids as any[];
    // console.log(`☄️ Отправлено ${asteroidsArray.length} астероидов клиенту ${clientId} (радиус: ${radius}, minDist: ${this.minAsteroidDist})`);

    this.clients.get(clientId)?.send(JSON.stringify({
      type: 'asteroidsData',
      data: asteroidsArray
    }));
  }

  private async handleUpdatePosition(clientId: string, data: any) {
    const { position, sector, playerName } = data;

    if (!playerName) return;

    try {
      const { playerIndex } = await this.playerManager.getOrCreatePlayer(playerName);
      this.clientToPlayer.set(clientId, playerIndex);

      await this.playerManager.updatePlayerInfo(playerIndex, {
        position,
        sector
      });
    } catch (error) {
      console.error('Ошибка обновления позиции:', error);
    }
  }

  private async handleMineAsteroid(clientId: string, data: any) {
    const { asteroidId, laserPower } = data;
    // TODO: Реализовать добычу астероидов
    // console.log(`⛏️ Добыча астероида ${asteroidId} (мощность: ${laserPower})`);
  }

  private async handleGetWorldInfo(clientId: string) {
    const worldInfo = {
      currentWorld: this.currentWorld,
      playerLegacy: null // TODO: Загрузить наследие игрока
    };

    this.clients.get(clientId)?.send(JSON.stringify({
      type: 'worldInfo',
      data: worldInfo
    }));
  }

  private async handlePlayerLogin(clientId: string, data: any) {
    const { playerName } = data;

    try {
      const { playerId, playerIndex, isNew } = await this.playerManager.getOrCreatePlayer(playerName);
      this.clientToPlayer.set(clientId, playerIndex);

      await this.playerManager.setPlayerOnline(playerIndex, true);

      const resources = await this.db.getPlayerResources(playerIndex);

      // Загружаем cargo_json из players (инициализируем если нет)
      const [rows] = await this.db.execute(
        'SELECT cargo_json FROM players WHERE username = ? LIMIT 1',
        [playerName]
      ) as any;

      let cargo = { metal: 0, silicon: 0, ice: 0, rare: 0, fuel: 0, water: 0 };
      if (rows.length > 0 && rows[0].cargo_json) {
        cargo = typeof rows[0].cargo_json === 'string'
          ? JSON.parse(rows[0].cargo_json)
          : rows[0].cargo_json;
      } else if (rows.length > 0) {
        // Инициализируем пустой cargo
        await this.db.execute(
          'UPDATE players SET cargo_json = ? WHERE username = ?',
          [JSON.stringify(cargo), playerName]
        );
      }

      this.clients.get(clientId)?.send(JSON.stringify({
        type: 'playerData',
        data: {
          playerId,
          playerIndex,
          playerName,
          resources,
          cargo,
          isNew
        }
      }));

      console.log(`👤 Игрок ${playerName} вошёл в игру (ID: ${playerIndex})`);
    } catch (error: any) {
      console.error('Ошибка входа игрока:', error);
      this.clients.get(clientId)?.send(JSON.stringify({
        type: 'error',
        message: 'Ошибка входа'
      }));
    }
  }

  /** Синхронизация cargo от клиента — добавляем РАЗНИЦУ (новые ресурсы от мининга) */
  private async handleSyncCargo(clientId: string, data: any) {
    const { playerName, cargo } = data;
    if (!playerName || !cargo) return;

    try {
      // Загружаем текущий cargo из БД
      const [rows] = await this.db.execute(
        'SELECT cargo_json FROM players WHERE username = ? LIMIT 1',
        [playerName]
      ) as any;

      let dbCargo = { metal: 0, silicon: 0, ice: 0, rare: 0, fuel: 0, water: 0 };
      if (rows.length > 0 && rows[0].cargo_json) {
        dbCargo = typeof rows[0].cargo_json === 'string' ? JSON.parse(rows[0].cargo_json) : rows[0].cargo_json;
      }

      // Добавляем РАЗНИЦУ: если клиент собрал больше чем есть в БД
      const merged = {
        metal: dbCargo.metal + Math.max(0, (cargo.metal || 0) - dbCargo.metal),
        silicon: dbCargo.silicon + Math.max(0, (cargo.silicon || 0) - dbCargo.silicon),
        ice: dbCargo.ice + Math.max(0, (cargo.ice || 0) - dbCargo.ice),
        rare: dbCargo.rare + Math.max(0, (cargo.rare || 0) - dbCargo.rare),
        fuel: dbCargo.fuel + Math.max(0, (cargo.fuel || 0) - dbCargo.fuel),
        water: dbCargo.water + Math.max(0, (cargo.water || 0) - dbCargo.water),
      };

      await this.db.execute(
        'UPDATE players SET cargo_json = ? WHERE username = ?',
        [JSON.stringify(merged), playerName]
      );
    } catch (e) {
      console.error('❌ syncCargo error:', e);
    }
  }
}

// Запускаем сервер
console.log('🚀 Creating GameServer instance...');
try {
  const server = new GameServer();
  console.log('✅ GameServer instance created');
  
  // Обработка завершения процесса
  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down...');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down...');
    process.exit(0);
  });
  
  process.on('exit', (code) => {
    console.log(`🛑 Process exiting with code ${code}`);
  });
  
  // Удерживаем процесс активным
  const keepAlive = setInterval(() => {
    console.log('⏰ Keep-alive tick');
  }, 10000);
  
  console.log('⏰ Keep-alive interval started');
} catch (error) {
  console.error('❌ Error creating GameServer:', error);
  process.exit(1);
}
