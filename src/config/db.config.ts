// src/config/db.config.ts
import dotenv from 'dotenv';
import path from 'path';

// Загружаем .env файл
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'prusakoviv',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cosmocraft',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

export const serverConfig = {
  port: parseInt(process.env.SERVER_PORT || '8080'),
  clientPort: parseInt(process.env.CLIENT_PORT || '8001')
};

console.log('📋 Конфигурация загружена:', {
  db: { ...dbConfig, password: '***' },
  server: serverConfig
});
