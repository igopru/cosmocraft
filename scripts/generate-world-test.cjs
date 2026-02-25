// scripts/generate-world-test.cjs
const { dbConfig } = require('../dist/config/db.config.js');
const mysql = require('mysql2/promise');
const { WorldGenerator } = require('../dist/world/WorldGenerator.js');

async function test() {
  console.log('🚀 Тест генерации мира...');
  
  let generator;
  let connection;
  
  try {
    // Подключаемся к БД через конфиг
    connection = await mysql.createConnection(dbConfig);
    generator = new WorldGenerator(dbConfig);
    
    // Очищаем таблицы
    console.log('🧹 Очистка таблиц...');
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    await connection.execute('TRUNCATE TABLE worlds');
    await connection.execute('TRUNCATE TABLE asteroids');
    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    
    // Создаем мир
    const world = await generator.createNewWorld(0);
    
    // Проверяем статистику
    const [asteroids] = await connection.execute('SELECT COUNT(*) as count FROM asteroids');
    console.log(`\n📊 Создано астероидов: ${asteroids[0].count}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    if (generator) await generator.close();
    if (connection) await connection.end();
  }
}

test();
