// scripts/migrate-json-to-mysql.cjs
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function migrateData() {
  console.log('🔄 Начинаем миграцию данных из JSON в MySQL...');
  console.log('📁 Рабочая директория:', process.cwd());
  
  // Параметры подключения к БД
  const dbConfig = {
    host: 'localhost',
    user: 'prusakoviv',
    password: '111',
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
    console.log('🔍 Проверяем star.json:', starPath);
    if (fs.existsSync(starPath)) {
      try {
        const starData = JSON.parse(fs.readFileSync(starPath, 'utf-8'));
        await connection.execute(
          `UPDATE star_system SET 
            star_temperature = ?, 
            star_radiation = ? 
           WHERE id = 1`,
          [starData.temperature || 5778, starData.radiation || 1000]
        );
        console.log('✅ Звезда обновлена');
      } catch (err) {
        console.log('⚠️ Ошибка при чтении star.json:', err.message);
      }
    } else {
      console.log('⚠️ Файл star.json не найден, пропускаем');
    }
    
    // 2. Миграция players (из папки players)
    const playersPath = path.join(__dirname, '../worlds/cosmos1/players');
    console.log('🔍 Проверяем players:', playersPath);
    
    if (fs.existsSync(playersPath)) {
      const playerFiles = fs.readdirSync(playersPath).filter(f => f.endsWith('.json'));
      console.log(`👥 Найдено файлов игроков: ${playerFiles.length}`);
      
      if (playerFiles.length === 0) {
        console.log('⚠️ Нет JSON файлов игроков, создаем тестового');
        await createTestPlayer(connection);
      } else {
        for (const file of playerFiles) {
          const filePath = path.join(playersPath, file);
          try {
            const playerData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            console.log(`  Обработка игрока: ${playerData.name || 'Unknown'} (${playerData.id || 'нет ID'})`);
            
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
                playerData.name || file.replace('.json', ''),
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
                    [playerData.id || playerData.id, type, amount]
                  );
                }
              }
            }
            
            console.log(`  ✅ Игрок ${playerData.name || 'Unknown'} импортирован`);
          } catch (err) {
            console.log(`  ❌ Ошибка при обработке файла ${file}:`, err.message);
          }
        }
      }
    } else {
      console.log('⚠️ Папка players не найдена, создаем тестового игрока');
      await createTestPlayer(connection);
    }
    
    // 3. Миграция stations.json

    // 3. Миграция stations.json
    const stationsPath = path.join(__dirname, '../worlds/cosmos1/stations.json');
    console.log('🔍 Проверяем stations.json:', stationsPath);

    if (fs.existsSync(stationsPath)) {
      try {
        const fileContent = fs.readFileSync(stationsPath, 'utf-8').trim();
        console.log('  Содержимое файла:', fileContent.substring(0, 100) + '...');

        let stations = [];
        if (fileContent) {
          const parsed = JSON.parse(fileContent);
          // Проверяем, есть ли ключ "stations" в объекте
          if (parsed && parsed.stations && Array.isArray(parsed.stations)) {
            stations = parsed.stations;
            console.log(`  ✅ Найдено станций в объекте stations: ${stations.length}`);
          } else if (Array.isArray(parsed)) {
            stations = parsed;
            console.log(`  ✅ Найдено станций в массиве: ${stations.length}`);
          } else {
            console.log('  ⚠️ Неожиданная структура JSON, ожидался массив или объект с полем stations');
            console.log('  Структура:', Object.keys(parsed));
          }
        }

        if (stations.length > 0) {
          console.log(`🏭 Импортируем станций: ${stations.length}`);

              // Получаем первого игрока для владельца
              const [players] = await connection.execute('SELECT id FROM players LIMIT 1');
              const ownerId = (players[0])?.id || null;

          for (const station of stations) {
            if (!station || !station.id) {
              console.log('  ⚠️ Пропуск станции без ID');
              continue;
            }

            console.log(`  Обработка станции: ${station.id} (${station.name || 'без имени'})`);

            // Вставка станции
            await connection.execute(
              `INSERT INTO stations (
                id, owner_id, sector_id, 
                position_x, position_y, position_z,
                health, max_health, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
              ON DUPLICATE KEY UPDATE
                position_x = VALUES(position_x),
                position_y = VALUES(position_y),
                position_z = VALUES(position_z)`,
              [
                station.id,
                ownerId,
                station.sectorId || 'sector_1',
                station.position?.x || 0,
                station.position?.y || 0,
                station.position?.z || 0,
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
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
              ON DUPLICATE KEY UPDATE
                type = VALUES(type)`,
              [
                station.id + '_module',
                station.id,
                station.type || 'habitat',
                station.position?.x || 0,
                station.position?.y || 0,
                station.position?.z || 0,
                station.health || 100,
                100
              ]
            );

            console.log(`  ✅ Станция ${station.id} импортирована`);
          }
        } else {
          console.log('⚠️ Нет станций для импорта');
        }
      } catch (err) {
        console.log('❌ Ошибка при чтении stations.json:', err.message);
        console.log('  Полная ошибка:', err);
      }
    } else {
      console.log('⚠️ Файл stations.json не найден');
    }

    // 4. Миграция asteroids.json
    const asteroidsPath = path.join(__dirname, '../worlds/cosmos1/asteroids.json');
    console.log('🔍 Проверяем asteroids.json:', asteroidsPath);

    if (fs.existsSync(asteroidsPath)) {
      try {
        const fileContent = fs.readFileSync(asteroidsPath, 'utf-8').trim();
    
        if (fileContent) {
          console.log('  Файл asteroids.json содержит данные, импортируем');
          // Здесь можно добавить парсинг астероидов
          const parsed = JSON.parse(fileContent);
          console.log('  Структура астероидов:', Object.keys(parsed));
        } else {
          console.log('  Файл asteroids.json пуст, создаем тестовые астероиды');
          await createTestAsteroids(connection);
        }
      } catch (err) {
        console.log('❌ Ошибка при чтении asteroids.json:', err.message);
        console.log('  Создаем тестовые астероиды');
        await createTestAsteroids(connection);
      }
    } else {
      console.log('⚠️ Файл asteroids.json не найден, создаем тестовые астероиды');
      await createTestAsteroids(connection);
    }
    
    console.log('\n🎉 Миграция успешно завершена!');
    
    // Показываем статистику
    const [playerCount] = await connection.execute('SELECT COUNT(*) as count FROM players');
    const [asteroidCount] = await connection.execute('SELECT COUNT(*) as count FROM asteroids');
    const [stationCount] = await connection.execute('SELECT COUNT(*) as count FROM stations');
    
    console.log('\n📊 Статистика БД:');
    console.log(`   Игроков: ${playerCount[0].count}`);
    console.log(`   Астероидов: ${asteroidCount[0].count}`);
    console.log(`   Станций: ${stationCount[0].count}`);
    
  } catch (error) {
    console.error('❌ Ошибка при миграции:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Соединение с БД закрыто');
    }
  }
}

async function createTestPlayer(connection) {
  const testPlayerId = crypto.randomUUID();
  await connection.execute(
    `INSERT INTO players (id, username, current_sector_id, position_x, position_y, position_z, is_online, created_at)
     VALUES (?, 'Gora', 'sector_1', 0, 0, 500, false, NOW())`,
    [testPlayerId]
  );
  
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

// Запуск миграции
migrateData();