#!/usr/bin/env node
/**
 * Скрипт инициализации базы данных CosmoCraft
 * Использование: node scripts/database/init-database.js
 * 
 * Инициализирует основную схему и систему авторизации
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

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbConfig.database, tableName]
  );
  return rows.length > 0;
}

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbConfig.database, tableName, columnName]
  );
  return rows.length > 0;
}

async function initDatabase() {
  console.log('🚀 Инициализация базы данных CosmoCraft...\n');

  let connection;

  try {
    // Подключение без указания БД для создания
    const baseConfig = { ...dbConfig, database: null, multipleStatements: true };
    connection = await mysql.createConnection(baseConfig);

    console.log('✅ Подключено к MySQL серверу');

    // Создаём БД если не существует
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` 
       DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`
    );
    console.log(`✅ База данных \`${dbConfig.database}\` готова\n`);

    // Закрываем и переподключаемся к конкретной БД
    await connection.end();
    
    const dbConnection = await mysql.createConnection(dbConfig);
    connection = dbConnection;

    // Чтение основной схемы и выполнение по таблицам
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📄 Чтение основной схемы...');
    
    // Разбиваем на отдельные запросы и выполняем только CREATE TABLE IF NOT EXISTS
    const statements = schemaSQL.split(';').filter(s => s.trim());
    let tablesCreated = 0;
    
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (trimmed.toUpperCase().includes('CREATE TABLE IF NOT EXISTS')) {
        try {
          await connection.query(trimmed + ';');
          const match = trimmed.match(/CREATE TABLE IF NOT EXISTS `?(\w+)`?/i);
          if (match) {
            console.log(`   ✅ Таблица ${match[1]}`);
            tablesCreated++;
          }
        } catch (e) {
          // Игнорируем ошибки для существующих таблиц
          if (!e.message.includes('already exists')) {
            console.log(`   ⚠️  Пропущено: ${e.message.split('\n')[0]}`);
          }
        }
      }
      // Пропускаем INSERT INTO для sectors (там могут быть проблемы с колонками)
      if (trimmed.toUpperCase().includes('INSERT INTO') && !trimmed.includes('players')) {
        // Пропускаем
      }
    }
    
    console.log(`\n✅ Основная схема: создано ${tablesCreated} новых таблиц\n`);

    // Чтение схемы авторизации
    const authSchemaPath = path.join(__dirname, 'auth-schema.sql');
    if (fs.existsSync(authSchemaPath)) {
      const authSchemaSQL = fs.readFileSync(authSchemaPath, 'utf8');
      
      console.log('📄 Чтение схемы авторизации...');
      
      const authStatements = authSchemaSQL.split(';').filter(s => s.trim());
      let authTablesCreated = 0;
      
      for (const stmt of authStatements) {
        const trimmed = stmt.trim();
        if (trimmed.toUpperCase().includes('CREATE TABLE IF NOT EXISTS')) {
          try {
            await connection.query(trimmed + ';');
            const match = trimmed.match(/CREATE TABLE IF NOT EXISTS `?(\w+)`?/i);
            if (match) {
              console.log(`   ✅ Таблица ${match[1]}`);
              authTablesCreated++;
            }
          } catch (e) {
            if (!e.message.includes('already exists')) {
              console.log(`   ⚠️  Пропущено: ${e.message.split('\n')[0]}`);
            }
          }
        }
        // Пропускаем CREATE PROCEDURE если уже существует
        if (trimmed.toUpperCase().includes('CREATE PROCEDURE')) {
          try {
            await connection.query(trimmed + ';');
          } catch (e) {
            // Игнорируем если процедура уже есть
          }
        }
      }
      
      console.log(`\n✅ Система авторизации: создано ${authTablesCreated} таблиц\n`);
    } else {
      console.log('⚠️  Файл auth-schema.sql не найден.');
    }

    // Проверка созданных таблиц
    const [tables] = await connection.query(
      `SHOW TABLES FROM \`${dbConfig.database}\``
    );

    console.log('📋 Все таблицы в базе данных:');
    tables.forEach(table => {
      const tableName = Object.values(table)[0];
      console.log(`   - ${tableName}`);
    });

    // Проверка данных
    try {
      const [players] = await connection.query(
        `SELECT COUNT(*) as count FROM players`
      );
      console.log(`\n👤 Игроков в БД: ${players[0].count}`);
    } catch (e) {}

    try {
      const [asteroids] = await connection.query(
        `SELECT COUNT(*) as count FROM asteroids`
      );
      console.log(`☄️ Астероидов в БД: ${asteroids[0].count}`);
    } catch (e) {}

    // Проверка таблиц авторизации
    try {
      const [credentials] = await connection.query(
        `SELECT COUNT(*) as count FROM pilot_credentials`
      );
      console.log(`🔐 Пилотов в системе авторизации: ${credentials[0].count}`);
    } catch (e) {
      console.log('⚠️  Таблица pilot_credentials не найдена');
    }

    console.log('\n✅ Инициализация завершена успешно!\n');
    console.log('📝 Следующие шаги:');
    console.log('   1. Проверьте .env файл и смените секретные ключи');
    console.log('   2. Настройте SMTP сервер для email уведомлений');
    console.log('   3. Запустите сервер: npm run dev');

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

    if (error.sqlMessage) {
      console.error('\n📄 SQL ошибка:', error.sqlMessage);
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
