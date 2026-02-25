// scripts/migrate-json-to-mysql.ts
import mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface JsonPlayer {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  sector: string;
  resources: Record<string, number>;
  modules: string[];
}

interface JsonStation {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  rotation: { _x: number; _y: number; _z: number };
  connectors: any[];
  resources: Array<{ type: string; amount: number }>;
  health: number;
}

interface JsonAsteroid {
  id: string;
  typeKey: string;
  position: { x: number; y: number; z: number };
  rotation: { _x: number; _y: number; _z: number };
  resources: Array<{ type: string; amount: number }>;
  health: number;
  maxHealth: number;
  miningProgress: number;
  fieldId: string;
}

interface JsonAsteroidField {
  id: string;
  sectorId: string;
  bounds: { 
    min: { x: number; y: number; z: number }; 
    max: { x: number; y: number; z: number } 
  };
  density: number;
  asteroids: JsonAsteroid[];
}

async function migrateData() {
  console.log('🔄 Начинаем миграцию данных из JSON в MySQL...');
  console.log('📁 Рабочая директория:', process.cwd());
  
  // Параметры подключения к БД
  const dbConfig = {
    host: 'localhost',
    user: 'prusakoviv',
    password: 'your_password_here', // ⚠️ ЗАМЕНИТЕ НА РЕАЛЬНЫЙ ПАРОЛЬ
    database: 'cosmocraft'
  };
  
  let connection;
  
  try {
    // Подключение к БД
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Подключено к MySQL');
    
    // Очищаем существующие данные (опционально)
    console.log('🧹 Очищаем таблицы...');
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    await connection.execute('TRUNCATE TABLE asteroids');
    await connection.execute('TRUNCATE TABLE asteroid_fields');
    await connection.execute('TRUNCATE TABLE station_modules');
    await connection.execute('TRUNCATE TABLE stations');
    await connection.execute('TRUNCATE TABLE player_resources');
    await connection.execute('TRUNCATE TABLE players');
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    
    // 1. Миграция star.json (звезда)
    const starPath = path.join(__dirname, '../worlds/cosmos1/star.json');
    if (fs.existsSync(starPath)) {
      const starData = JSON.parse(fs.readFileSync(starPath, 'utf-8'));
      await connection.execute(
        `UPDATE star_system SET 
          star_temperature = ?, 
          star_radiation = ? 
         WHERE id = 1`,
        [starData.temperature || 5778, starData.radiation || 1000]
      );
      console.log('✅ Звезда обновлена');
    } else {
      console.log('⚠️ Файл star.json не найден, пропускаем');
    }
    
    // 2. Миграция players (из папки players)
    const playersPath = path.join(__dirname, '../worlds/cosmos1/players');
    if (fs.existsSync(playersPath)) {
      const playerFiles = fs.readdirSync(playersPath).filter(f => f.endsWith('.json'));
      console.log(`👥 Найдено игроков: ${playerFiles.length}`);
      
      for (const file of playerFiles) {
        const filePath = path.join(playersPath, file);
        const playerData: JsonPlayer = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // Вставка или обновление игрока
        await connection.execute(
          `INSERT INTO players (
            id, username, current_sector_id, 
            position_x, position_y, position_z, 
            is_online, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            current_sector_id = VALUES(current_sector_id),
            position_x = VALUES(position_x),
            position_y = VALUES(position_y),
            position_z = VALUES(position_z)`,
          [
            playerData.id || crypto.randomUUID(),
            playerData.name || 'Unknown',
            playerData.sector || 'sector_1',
            playerData.position?.x || 0,
            playerData.position?.y || 0,
            playerData.position?.z || 500,
            false
          ]
        );
        
        // Ресурсы игрока
        if (playerData.resources) {
          for (const [type, amount] of Object.entries(playerData.resources)) {
            if (amount > 0) {
              await connection.execute(
                `INSERT INTO player_resources (player_id, resource_type, amount)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
                [playerData.id, type, amount]
              );
            }
          }
        }
        
        console.log(`  ✅ Игрок ${playerData.name} (${playerData.id}) импортирован`);
      }
    } else {
      console.log('⚠️ Папка players не найдена, создаем тестового игрока');
      
      // Создаем тестового игрока
      const testPlayerId = crypto.randomUUID();
      await connection.execute(
        `INSERT INTO players (id, username, current_sector_id, position_x, position_y, position_z, is_online)
         VALUES (?, 'Gora', 'sector_1', 0, 0, 500, false)`,
        [testPlayerId]
      );
      
      // Тестовые ресурсы
      await connection.execute(
        `INSERT INTO player_resources (player_id, resource_type, amount) VALUES
         (?, 'metal', 1000),
         (?, 'silicon', 500),
         (?, 'ice', 300),
         (?, 'rare', 100)`,
        [testPlayerId, testPlayerId, testPlayerId, testPlayerId]
      );
      
      console.log('  ✅ Создан тестовый игрок Gora');
    }
    
    // 3. Миграция stations.json
    const stationsPath = path.join(__dirname, '../worlds/cosmos1/stations.json');
    if (fs.existsSync(stationsPath)) {
      const stations: JsonStation[] = JSON.parse(fs.readFileSync(stationsPath, 'utf-8'));
      console.log(`🏭 Найдено станций: ${stations.length}`);
      
      // Получаем первого игрока для владельца
      const [players] = await connection.execute('SELECT id FROM players LIMIT 1');
      const ownerId = (players as any[])[0]?.id || null;
      
      for (const station of stations) {
        // Вставка станции
        await connection.execute(
          `INSERT INTO stations (
            id, owner_id, sector_id, 
            position_x, position_y, position_z,
            health, max_health, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            station.id,
            ownerId,
            'sector_1',
            station.position.x,
            station.position.y,
            station.position.z,
            station.health || 1000,
            1000
          ]
        );
        
        // Вставка модуля станции
        await connection.execute(
          `INSERT INTO station_modules (
            id, station_id, type, 
            position_x, position_y, position_z,
            health, max_health, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            station.id, // используем тот же id для модуля
            station.id,
            station.type,
            station.position.x,
            station.position.y,
            station.position.z,
            station.health || 100,
            100
          ]
        );
        
        console.log(`  ✅ Станция ${station.id} (${station.type}) импортирована`);
      }
    }
    
    // 4. Миграция asteroids.json
    const asteroidsPath = path.join(__dirname, '../worlds/cosmos1/asteroids.json');
    if (fs.existsSync(asteroidsPath)) {
      const fields: JsonAsteroidField[] = JSON.parse(fs.readFileSync(asteroidsPath, 'utf-8'));
      console.log(`☄️ Найдено полей астероидов: ${fields.length}`);
      
      for (const field of fields) {
        // Вычисляем центр поля
        const centerX = (field.bounds.min.x + field.bounds.max.x) / 2;
        const centerY = (field.bounds.min.y + field.bounds.max.y) / 2;
        const centerZ = (field.bounds.min.z + field.bounds.max.z) / 2;
        const radius = Math.max(
          field.bounds.max.x - field.bounds.min.x,
          field.bounds.max.y - field.bounds.min.y,
          field.bounds.max.z - field.bounds.min.z
        ) / 2;
        
        // Вставка поля астероидов
        await connection.execute(
          `INSERT INTO asteroid_fields (
            id, sector_id, 
            center_x, center_y, center_z,
            radius, density, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            center_x = VALUES(center_x),
            center_y = VALUES(center_y),
            center_z = VALUES(center_z),
            radius = VALUES(radius),
            density = VALUES(density)`,
          [field.id, field.sectorId || 'sector_1', centerX, centerY, centerZ, radius, field.density || 0.5]
        );
        
        // Вставка астероидов
        let asteroidCount = 0;
        for (const asteroid of field.asteroids || []) {
          // Определяем количество ресурсов
          let metal = 0, silicon = 0, ice = 0, rare = 0;
          for (const r of asteroid.resources || []) {
            if (r.type === 'metal') metal = r.amount;
            else if (r.type === 'silicon') silicon = r.amount;
            else if (r.type === 'ice') ice = r.amount;
            else if (r.type === 'rare') rare = r.amount;
          }
          
          await connection.execute(
            `INSERT INTO asteroids (
              id, field_id, type,
              position_x, position_y, position_z,
              rotation_x, rotation_y, rotation_z,
              health, max_health,
              metal_amount, silicon_amount, ice_amount, rare_amount,
              is_depleted, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              asteroid.id || crypto.randomUUID(),
              field.id,
              asteroid.typeKey || 'metallic',
              asteroid.position?.x || 0,
              asteroid.position?.y || 0,
              asteroid.position?.z || 0,
              asteroid.rotation?._x || 0,
              asteroid.rotation?._y || 0,
              asteroid.rotation?._z || 0,
              asteroid.health || 100,
              asteroid.maxHealth || 100,
              metal,
              silicon,
              ice,
              rare,
              (asteroid.health || 100) <= 0 ? 1 : 0
            ]
          );
          asteroidCount++;
        }
        
        console.log(`  ✅ Поле ${field.id} с ${asteroidCount} астероидами импортировано`);
      }
    } else {
      console.log('⚠️ Файл asteroids.json не найден, создаем тестовое поле');
      
      // Создаем тестовое поле
      const fieldId = crypto.randomUUID();
      await connection.execute(
        `INSERT INTO asteroid_fields (id, sector_id, center_x, center_y, center_z, radius, density)
         VALUES (?, 'sector_1', 200, 0, 0, 100, 0.5)`,
        [fieldId]
      );
      
      // Создаем несколько тестовых астероидов
      const types = ['metallic', 'silicon', 'icy', 'rare'];
      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 50 + Math.random() * 50;
        const height = (Math.random() - 0.5) * 50;
        
        const x = 200 + distance * Math.cos(angle);
        const z = distance * Math.sin(angle);
        const y = height;
        
        const type = types[Math.floor(Math.random() * types.length)];
        const amounts = {
          metallic: { metal: 500, silicon: 0, ice: 0, rare: 0 },
          silicon: { metal: 0, silicon: 400, ice: 0, rare: 0 },
          icy: { metal: 0, silicon: 0, ice: 300, rare: 0 },
          rare: { metal: 200, silicon: 0, ice: 0, rare: 100 }
        };
        
        await connection.execute(
          `INSERT INTO asteroids (
            id, field_id, type,
            position_x, position_y, position_z,
            health, max_health,
            metal_amount, silicon_amount, ice_amount, rare_amount
          ) VALUES (?, ?, ?, ?, ?, ?, 100, 100, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            fieldId,
            type,
            x, y, z,
            amounts[type as keyof typeof amounts].metal,
            amounts[type as keyof typeof amounts].silicon,
            amounts[type as keyof typeof amounts].ice,
            amounts[type as keyof typeof amounts].rare
          ]
        );
      }
      
      console.log('  ✅ Создано тестовое поле с 20 астероидами');
    }
    
    console.log('\n🎉 Миграция успешно завершена!');
    
    // Показываем статистику
    const [playerCount] = await connection.execute('SELECT COUNT(*) as count FROM players');
    const [asteroidCount] = await connection.execute('SELECT COUNT(*) as count FROM asteroids');
    const [stationCount] = await connection.execute('SELECT COUNT(*) as count FROM stations');
    
    console.log('\n📊 Статистика БД:');
    console.log(`   Игроков: ${(playerCount as any[])[0].count}`);
    console.log(`   Астероидов: ${(asteroidCount as any[])[0].count}`);
    console.log(`   Станций: ${(stationCount as any[])[0].count}`);
    
  } catch (error) {
    console.error('❌ Ошибка при миграции:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Соединение с БД закрыто');
    }
  }
}

// Запуск миграции
migrateData();
