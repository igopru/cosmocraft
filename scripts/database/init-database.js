#!/usr/bin/env node
/**
 * Скрипт инициализации базы данных CosmoCraft
 * Использование: node scripts/database/init-database.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cosmocraft',
  multipleStatements: true
};

async function initDatabase() {
  console.log('🚀 Инициализация базы данных CosmoCraft...\n');

  let connection;

  try {
    // Подключение без указания БД для создания
    const baseConfig = { ...dbConfig, database: null, multipleStatements: true };
    connection = await mysql.createConnection(baseConfig);

    console.log('✅ Подключено к MySQL серверу');

    // Чтение SQL скрипта
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');

    console.log('📄 Чтение схемы из:', schemaPath);

    // Создание БД и таблиц
    console.log('\n📊 Создание базы данных и таблиц...');
    await connection.query(schemaSQL);

    console.log('✅ База данных успешно создана!\n');

    // Проверка созданных таблиц
    const [tables] = await connection.query(
      `SHOW TABLES FROM \`${dbConfig.database}\``
    );

    console.log('📋 Созданные таблицы:');
    tables.forEach(table => {
      const tableName = Object.values(table)[0];
      console.log(`   - ${tableName}`);
    });

    // Проверка данных
    const [sectors] = await connection.query(
      `SELECT COUNT(*) as count FROM sectors`
    );
    console.log(`\n📊 Загружено секторов: ${sectors[0].count}`);

    const [players] = await connection.query(
      `SELECT COUNT(*) as count FROM players`
    );
    console.log(`👤 Игроков в БД: ${players[0].count}`);

    const [asteroids] = await connection.query(
      `SELECT COUNT(*) as count FROM asteroids`
    );
    console.log(`☄️ Астероидов в БД: ${asteroids[0].count}`);

    console.log('\n✅ Инициализация завершена успешно!\n');

  } catch (error) {
    console.error('❌ Ошибка инициализации:', error.message);
    
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n🔐 Проверьте логин/пароль в .env файле');
      console.error(`   DB_USER=${process.env.DB_USER || 'root'}`);
      console.error(`   DB_PASSWORD=${process.env.DB_PASSWORD ? '***' : '(пусто)'}`);
    }
    
    if (error.code === 'ENOENT') {
      console.error('\n📄 Файл schema.sql не найден!');
      console.error('   Убедитесь, что файл существует: scripts/database/schema.sql');
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n👋 Соединение закрыто');
    }
  }
}

// Запуск
if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase };
