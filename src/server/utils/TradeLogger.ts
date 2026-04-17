// src/server/utils/TradeLogger.ts
/**
 * Логгер торговли на станции
 * - Отдельный файл: logs/trade.log
 * - Ротация: 5 файлов по 1MB (итого ~5MB макс)
 * - Формат: [YYYY-MM-DD HH:mm:ss] MESSAGE
 */
import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'trade.log');
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_BACKUPS = 5;

// Создаём директорию если нет
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateIfNeeded() {
  if (!fs.existsSync(LOG_FILE)) return;
  const stats = fs.statSync(LOG_FILE);
  if (stats.size >= MAX_FILE_SIZE) {
    // Сдвигаем бэкапы
    for (let i = MAX_BACKUPS - 1; i > 0; i--) {
      const src = `${LOG_FILE}.${i}`;
      const dst = `${LOG_FILE}.${i + 1}`;
      if (fs.existsSync(src)) {
        fs.renameSync(src, dst);
      }
    }
    // Текущий → .1
    fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
  }
}

function logTrade(message: string) {
  rotateIfNeeded();
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const line = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf8');
}

export function logSell(player: string, resource: string, amount: number, total: number, balance: number) {
  const msg = `SELL  player=${player} resource=${resource} amount=${amount} total=${total.toFixed(1)} balance=${balance.toFixed(1)}`;
  logTrade(msg);
  console.log(`💰 [TRADE LOG] ${msg}`);
}

export function logBuy(player: string, resource: string, amount: number, total: number, balance: number, discount?: number) {
  const disc = discount ? ` discount=${discount}%` : '';
  const msg = `BUY   player=${player} resource=${resource} amount=${amount} total=${total.toFixed(1)} balance=${balance.toFixed(1)}${disc}`;
  logTrade(msg);
  console.log(`💰 [TRADE LOG] ${msg}`);
}

export function logService(player: string, service: string, amount: number, cost: number, balance: number) {
  const msg = `SVC   player=${player} service=${service} amount=${amount} cost=${cost.toFixed(1)} balance=${balance.toFixed(1)}`;
  logTrade(msg);
  console.log(`💰 [TRADE LOG] ${msg}`);
}

export function logError(player: string, action: string, error: string) {
  const msg = `ERR   player=${player} action=${action} error="${error}"`;
  logTrade(msg);
  console.warn(`⚠️ [TRADE LOG] ${msg}`);
}

export function logBalanceLoad(player: string, balance: number, source: string) {
  const msg = `BAL   player=${player} balance=${balance.toFixed(2)} source=${source}`;
  logTrade(msg);
}
