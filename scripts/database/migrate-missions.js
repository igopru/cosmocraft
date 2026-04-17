#!/usr/bin/env node
/**
 * Скрипт миграции системы заданий CosmoCraft
 * Использование: node scripts/database/migrate-missions.js
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

async function migrateMissions() {
  console.log('🚀 Миграция системы заданий CosmoCraft...\n');

  let connection;

  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Подключено к базе данных\n');

    // 1. Создаём таблицы заданий
    const schemaPath = path.join(__dirname, 'missions-schema.sql');
    if (!fs.existsSync(schemaPath)) {
      console.error('❌ Файл missions-schema.sql не найден!');
      process.exit(1);
    }

    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    console.log('📄 Создание таблиц системы заданий...');

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
          if (!e.message.includes('already exists')) {
            console.log(`   ⚠️  Пропущено: ${e.message.split('\n')[0]}`);
          }
        }
      }
      // Пропускаем INSERT INTO (отдельно добавим)
      if (trimmed.toUpperCase().includes('CREATE OR REPLACE VIEW')) {
        try {
          await connection.query(trimmed + ';');
          console.log(`   ✅ Представление создано`);
        } catch (e) {
          console.log(`   ⚠️  Представление: ${e.message.split('\n')[0]}`);
        }
      }
    }

    console.log(`\n✅ Создано/проверено ${tablesCreated} таблиц\n`);

    // 2. Проверяем и добавляем начальные ранги
    const rankCount = await tableExists(connection, 'pilot_ranks');
    if (rankCount) {
      const [ranks] = await connection.query(`SELECT COUNT(*) as count FROM pilot_ranks`);
      if (ranks[0].count === 0) {
        console.log('📋 Добавление начальных рангов пилотов...');
        const ranksSQL = `
          INSERT INTO pilot_ranks (id, title, required_xp, icon, color, description, sort_order) VALUES
          ('rank_1', 'Новичок', 0, '🚀', '#9e9e9e', 'Только начал свой путь в космосе', 1),
          ('rank_2', 'Исследователь', 50, '🔭', '#4caf50', 'Начал изучать просторы космоса', 2),
          ('rank_3', 'Пилот', 150, '🛸', '#2196f3', 'Опытный пилот космических кораблей', 3),
          ('rank_4', 'Навигатор', 300, '🧭', '#00bcd4', 'Знает космос как свои пять пальцев', 4),
          ('rank_5', 'Капитан', 500, '⭐', '#ff9800', 'Командир с большим опытом', 5),
          ('rank_6', 'Коммандер', 800, '🌟', '#f44336', 'Элита космических сил', 6),
          ('rank_7', 'Адмирал', 1200, '💫', '#9c27b0', 'Легенда галактики', 7),
          ('rank_8', 'Покоритель Звёзд', 2000, '✨', '#ffeb3b', 'Достиг невозможного', 8);
        `;
        await connection.query(ranksSQL);
        console.log('   ✅ Добавлено 8 рангов\n');
      } else {
        console.log(`📋 Ранги уже существуют (${ranks[0].count} шт.)\n`);
      }
    }

    // 3. Проверяем и добавляем начальные задания
    const missionsExist = await tableExists(connection, 'missions');
    if (missionsExist) {
      const [missions] = await connection.query(`SELECT COUNT(*) as count FROM missions`);
      if (missions[0].count === 0) {
        console.log('📋 Добавление начальных заданий...');
        const missionsDataPath = path.join(__dirname, 'seed-missions.sql');
        if (fs.existsSync(missionsDataPath)) {
          const missionsSQL = fs.readFileSync(missionsDataPath, 'utf8');
          const missionStmts = missionsSQL.split(';').filter(s => s.trim());
          let addedCount = 0;
          for (const stmt of missionStmts) {
            const trimmed = stmt.trim();
            if (trimmed.toUpperCase().includes('INSERT INTO')) {
              try {
                await connection.query(trimmed + ';');
                addedCount++;
              } catch (e) {
                if (!e.message.includes('Duplicate')) {
                  console.log(`   ⚠️  Задание: ${e.message.split('\n')[0]}`);
                }
              }
            }
          }
          console.log(`   ✅ Добавлено ${addedCount} заданий\n`);
        } else {
          console.log('   ⚠️  Файл seed-missions.sql не найден\n');
        }
      } else {
        console.log(`📋 Задания уже существуют (${missions[0].count} шт.)\n`);
      }
    }

    // Итоговая статистика
    try {
      const [stats] = await connection.query(`
        SELECT
          (SELECT COUNT(*) FROM missions) as total_missions,
          (SELECT COUNT(*) FROM pilot_ranks) as total_ranks
      `);
      console.log('📊 Итоговая статистика:');
      console.log(`   📋 Заданий: ${stats[0].total_missions}`);
      console.log(`   🏆 Рангов: ${stats[0].total_ranks}`);
    } catch (e) {}

    console.log('\n✅ Миграция системы заданий завершена успешно!\n');

  } catch (error) {
    console.error('❌ Ошибка миграции:', error.message);
    if (error.sqlMessage) {
      console.error('\n📄 SQL ошибка:', error.sqlMessage);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('👋 Соединение закрыто');
    }
  }
}

if (require.main === module) {
  migrateMissions();
}

module.exports = { migrateMissions };
