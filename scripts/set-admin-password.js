#!/usr/bin/env node
/**
 * Скрипт установки пароля администратора
 * Использование: node scripts/set-admin-password.js [новый_пароль]
 */

const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cosmocraft',
};

async function setAdminPassword(newPassword) {
  console.log('🔐 Установка пароля администратора...\n');

  let connection;

  try {
    // Подключение к БД
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Подключено к базе данных\n');

    // Генерация хэша
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    console.log(`📝 Новый пароль: ${newPassword}`);
    console.log(`🔒 Хэш пароля: ${passwordHash.substring(0, 30)}...\n`);

    // Обновление пароля администратора
    const [result] = await connection.execute(
      `UPDATE admin_users 
       SET password_hash = ?, password_salt = ?, updated_at = NOW()
       WHERE username = 'admin'`,
      [passwordHash, salt]
    );

    if (result.affectedRows > 0) {
      console.log('✅ Пароль администратора успешно обновлён!\n');
      console.log('📋 Данные для входа:');
      console.log(`   Логин: admin`);
      console.log(`   Пароль: ${newPassword}`);
      console.log(`   URL: http://localhost:8001/admin/\n`);
    } else {
      console.log('⚠️ Администратор "admin" не найден! Создайте его вручную.\n');
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Запуск
const newPassword = process.argv[2] || 'AdminPassword123!';
setAdminPassword(newPassword);
