// src/server/GameServer.ts
import { dbConfig, serverConfig } from '../config/db.config';
import WebSocket, { WebSocketServer } from 'ws';
import { DatabaseManager } from './storage/DatabaseManager';
import { LotkaVolterraGenerator } from '../world/LotkaVolterraGenerator';
import { PlayerManager } from './utils/PlayerManager';
import { initAdminRoutes } from './routes/admin.routes';
import { router as authRouter } from './routes/auth.routes';
import * as crypto from 'crypto';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';

// Используем process.cwd() для корректной работы при запуске через ts-node
const baseDir = process.cwd();
const publicPath = path.join(baseDir, 'public');
const sharedStationPath = path.join(baseDir, 'stations', 'shared');
const playerBasePath = path.join(baseDir, 'players');
const adminPath = path.join(baseDir, 'public', 'admin');

export class GameServer {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocket> = new Map();
  private db: DatabaseManager;
  private playerManager: PlayerManager;
  private worldGenerator: LotkaVolterraGenerator;
  private currentWorld: any = null;
  private app: any;
  // Маппинг clientId -> playerIndex
  private clientToPlayer: Map<string, string> = new Map();

  constructor() {
    this.db = new DatabaseManager();
    this.playerManager = new PlayerManager(this.db, playerBasePath);
    this.worldGenerator = new LotkaVolterraGenerator(dbConfig);
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

    // GET /api/stations/:name - чтение конкретной модели
    this.app.get('/api/stations/:name', async (req: any, res: any) => {
      try {
        const { name } = req.params;
        const playerName = req.query.playerName as string || 'default';
        const { playerIndex } = await this.playerManager.getOrCreatePlayer(playerName);

        // Сначала ищем в личных станциях игрока
        const personalStation = await this.playerManager.loadPlayerStation(playerIndex, name);
        if (personalStation) {
          return res.json(personalStation);
        }

        // Потом в общих
        const filename = `${name.replace(/[^a-z0-9]/gi, '_')}.blueprint.json`;
        const sharedFilepath = path.join(sharedStationPath, filename);
        
        if (fs.existsSync(sharedFilepath)) {
          const data = fs.readFileSync(sharedFilepath, 'utf8');
          return res.json(JSON.parse(data));
        }

        res.status(404).json({ error: 'Модель не найдена' });
      } catch (error: any) {
        console.error('Ошибка загрузки станции:', error);
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
    this.app.use('/api/admin', adminRoutes);

    // Маршруты авторизации (регистрация, вход, восстановление пароля)
    this.app.use('/api/auth', authRouter);
    this.db; // Сохраняем экземпляр БД для доступа из auth routes

    // Статические файлы админ-панели
    this.app.use('/admin', express.static(adminPath));

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
      case 'playerLogin':
        await this.handlePlayerLogin(clientId, message.data);
        break;
      default:
        console.log('❌ Неизвестный тип сообщения:', message.type);
    }
  }

  private async handleGetAsteroids(clientId: string, data: any) {
    const { position, radius = 500 } = data;

    // Проверяем, что позиция корректна
    if (!position || position.x === undefined || position.y === undefined || position.z === undefined) {
      console.warn(`⚠️ Некорректная позиция от клиента ${clientId}:`, position);
      return;
    }

    const asteroids = await this.db.getAsteroidsInRange(
      position.x, position.y, position.z, radius
    );

    const asteroidsArray = asteroids as any[];
    console.log(`☄️ Отправлено ${asteroidsArray.length} астероидов клиенту ${clientId} (радиус: ${radius})`);

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
    console.log(`⛏️ Добыча астероида ${asteroidId} (мощность: ${laserPower})`);
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

      this.clients.get(clientId)?.send(JSON.stringify({
        type: 'playerData',
        data: {
          playerId,
          playerIndex,
          playerName,
          resources,
          isNew
        }
      }));

      console.log(`👤 Игрок ${playerName} вошёл в игру (ID: ${playerIndex})`);
    } catch (error: any) {
      console.error('Ошибка входа игрока:', error);
      this.clients.get(clientId)?.send(JSON.stringify({
        type: 'error',
        data: { message: error.message }
      }));
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
