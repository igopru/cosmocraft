// src/server/utils/PlayerManager.ts
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseManager } from '../storage/DatabaseManager';

/**
 * Менеджер игроков
 * - Создаёт индексные ID для игроков
 * - Обфусцирует имена для защиты БД
 * - Управляет папками игроков
 */
export class PlayerManager {
  private db: DatabaseManager;
  private playerBasePath: string;
  private nameToIndexCache: Map<string, string> = new Map();

  constructor(db: DatabaseManager, playerBasePath: string) {
    this.db = db;
    this.playerBasePath = playerBasePath;

    // Создаём базовую папку если не существует
    if (!fs.existsSync(playerBasePath)) {
      fs.mkdirSync(playerBasePath, { recursive: true });
      console.log(`📁 Создана базовая папка игроков: ${playerBasePath}`);
    }
  }

  /**
   * Обфускация имени для защиты БД
   * Создаёт хэш на основе имени и секретного ключа
   */
  private obfuscateName(name: string): string {
    const secret = process.env.OBFUSCATION_SECRET || 'cosmocraft_default_secret_2026';
    const hash = crypto.createHmac('sha256', secret)
      .update(name.toLowerCase().trim())
      .digest('hex')
      .substring(0, 16);
    return hash;
  }

  /**
   * Валидация имени игрока
   * Разрешены: буквы, цифры, пробелы, подчёркивания
   * Длина: 3-20 символов
   */
  private validatePlayerName(name: string): { valid: boolean; error?: string } {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Имя игрока не может быть пустым' };
    }

    const trimmed = name.trim();

    if (trimmed.length < 3 || trimmed.length > 20) {
      return { valid: false, error: 'Длина имени должна быть от 3 до 20 символов' };
    }

    // Разрешаем буквы (включая кириллицу), цифры, пробелы и подчёркивания
    const validPattern = /^[a-zA-Zа-яА-ЯёЁ0-9_ ]+$/u;
    if (!validPattern.test(trimmed)) {
      return { valid: false, error: 'Имя может содержать только буквы, цифры, пробелы и подчёркивания' };
    }

    // Запрещаем опасные символы для защиты от SQL инъекций и XSS
    const dangerousPatterns = ['<', '>', '"', "'", ';', '--', '/*', '*/', '\\', '/', '.', '*', '?', '|', '&', '$', '#', '@', '!', '%', '^', '(', ')', '[', ']', '{', '}', ',', '=', '+', '`', '~'];
    for (const pattern of dangerousPatterns) {
      if (trimmed.includes(pattern)) {
        return { valid: false, error: `Имя содержит недопустимый символ: ${pattern}` };
      }
    }

    return { valid: true };
  }

  /**
   * Валидация имени станции/корабля
   * Более строгие правила - только латиница и цифры
   */
  private validateObjectName(name: string): { valid: boolean; error?: string } {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Имя не может быть пустым' };
    }

    const trimmed = name.trim();

    if (trimmed.length < 3 || trimmed.length > 30) {
      return { valid: false, error: 'Длина имени должна быть от 3 до 30 символов' };
    }

    // Только латиница, цифры и подчёркивания
    const validPattern = /^[a-zA-Z0-9_]+$/;
    if (!validPattern.test(trimmed)) {
      return { valid: false, error: 'Имя может содержать только латинские буквы, цифры и подчёркивания' };
    }

    return { valid: true };
  }

  /**
   * Получить или создать игрока по имени
   * Возвращает индексный ID и создаёт папку
   */
  async getOrCreatePlayer(playerName: string): Promise<{ playerId: string; playerIndex: string; isNew: boolean }> {
    // Валидация имени
    const validation = this.validatePlayerName(playerName);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const normalizedName = playerName.trim();
    const obfuscatedName = this.obfuscateName(normalizedName);

    // Проверяем кэш
    let playerIndex = this.nameToIndexCache.get(obfuscatedName);

    if (playerIndex) {
      // Игрок найден в кэше
      const player = await this.db.getPlayer(playerIndex);
      if (player) {
        return { playerId: playerIndex, playerIndex, isNew: false };
      }
    }

    // Ищем игрока по имени в БД
    const [existingPlayers] = await this.db.execute(
      `SELECT id FROM players WHERE username = ? LIMIT 1`,
      [normalizedName]
    );

    const playersArray = existingPlayers as any[];
    if (playersArray.length > 0) {
      // Игрок найден в БД
      playerIndex = playersArray[0].id;
      if (playerIndex) {
        this.nameToIndexCache.set(obfuscatedName, playerIndex);

        // Убеждаемся, что папка существует
        await this.ensurePlayerFolder(playerIndex);

        return { playerId: playerIndex, playerIndex, isNew: false };
      }
    }

    // Создаём нового игрока
    playerIndex = crypto.randomUUID();
    this.nameToIndexCache.set(obfuscatedName, playerIndex);

    // Создаём запись в БД
    await this.db.execute(
      `INSERT INTO players (id, username, created_at, last_login, is_online, position_x, position_y, position_z)
       VALUES (?, ?, NOW(), NOW(), FALSE, 0, 500, 0)`,
      [playerIndex, normalizedName]
    );

    // Создаём папку игрока
    await this.ensurePlayerFolder(playerIndex);

    // Создаём начальные ресурсы
    await this.db.initializePlayerResources(playerIndex);

    console.log(`👤 Создан новый игрок: ${normalizedName} (ID: ${playerIndex})`);

    return { playerId: playerIndex, playerIndex, isNew: true };
  }

  /**
   * Создать папку для игрока если не существует
   */
  private async ensurePlayerFolder(playerIndex: string): Promise<string> {
    const playerFolder = path.join(this.playerBasePath, playerIndex);

    if (!fs.existsSync(playerFolder)) {
      fs.mkdirSync(playerFolder, { recursive: true });
      console.log(`📁 Создана папка игрока: ${playerFolder}`);
    }

    return playerFolder;
  }

  /**
   * Получить папку игрока по индексному ID
   */
  getPlayerFolder(playerIndex: string): string {
    return path.join(this.playerBasePath, playerIndex);
  }

  /**
   * Получить список станций игрока
   */
  async getPlayerStations(playerIndex: string): Promise<Array<{ name: string; type: 'personal' }>> {
    const playerFolder = this.getPlayerFolder(playerIndex);
    const stations: Array<{ name: string; type: 'personal' }> = [];

    if (fs.existsSync(playerFolder)) {
      const files = fs.readdirSync(playerFolder);
      for (const file of files) {
        if (file.endsWith('.blueprint.json')) {
          stations.push({
            name: file.replace('.blueprint.json', ''),
            type: 'personal'
          });
        }
      }
    }

    return stations;
  }

  /**
   * Сохранить станцию игрока
   */
  async savePlayerStation(playerIndex: string, stationName: string, data: any): Promise<{ success: boolean; error?: string }> {
    // Валидация имени станции
    const validation = this.validateObjectName(stationName);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const playerFolder = this.getPlayerFolder(playerIndex);
    const filename = `${stationName}.blueprint.json`;
    const filepath = path.join(playerFolder, filename);

    try {
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`💾 Станция сохранена: ${filepath}`);
      return { success: true };
    } catch (error) {
      console.error('Ошибка сохранения станции:', error);
      return { success: false, error: 'Не удалось сохранить станцию' };
    }
  }

  /**
   * Удалить станцию игрока
   */
  async deletePlayerStation(playerIndex: string, stationName: string): Promise<{ success: boolean; error?: string }> {
    const validation = this.validateObjectName(stationName);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const playerFolder = this.getPlayerFolder(playerIndex);
    const filename = `${stationName}.blueprint.json`;
    const filepath = path.join(playerFolder, filename);

    if (!fs.existsSync(filepath)) {
      return { success: false, error: 'Станция не найдена' };
    }

    try {
      fs.unlinkSync(filepath);
      console.log(`🗑️ Станция удалена: ${filepath}`);
      return { success: true };
    } catch (error) {
      console.error('Ошибка удаления станции:', error);
      return { success: false, error: 'Не удалось удалить станцию' };
    }
  }

  /**
   * Загрузить станцию игрока
   */
  async loadPlayerStation(playerIndex: string, stationName: string): Promise<any | null> {
    const validation = this.validateObjectName(stationName);
    if (!validation.valid) {
      return null;
    }

    const playerFolder = this.getPlayerFolder(playerIndex);
    const filename = `${stationName}.blueprint.json`;
    const filepath = path.join(playerFolder, filename);

    if (!fs.existsSync(filepath)) {
      return null;
    }

    try {
      const data = fs.readFileSync(filepath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Ошибка загрузки станции:', error);
      return null;
    }
  }

  /**
   * Обновить информацию об игроке в БД
   */
  async updatePlayerInfo(playerIndex: string, data: {
    position?: { x: number; y: number; z: number };
    sector?: string;
    shipType?: string;
    shipHealth?: number;
  }): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.position) {
      updates.push('position_x = ?, position_y = ?, position_z = ?');
      values.push(data.position.x, data.position.y, data.position.z);
    }

    if (data.sector) {
      updates.push('current_sector_id = ?');
      values.push(data.sector);
    }

    if (data.shipType) {
      updates.push('ship_type = ?');
      values.push(data.shipType);
    }

    if (data.shipHealth !== undefined) {
      updates.push('ship_health = ?');
      values.push(data.shipHealth);
    }

    if (updates.length > 0) {
      updates.push('last_login = NOW()');
      values.push(playerIndex);

      await this.db.execute(
        `UPDATE players SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }
  }

  /**
   * Получить информацию об игроке
   */
  async getPlayerInfo(playerIndex: string): Promise<any | null> {
    return await this.db.getPlayer(playerIndex);
  }

  /**
   * Установить онлайн статус игрока
   */
  async setPlayerOnline(playerIndex: string, isOnline: boolean): Promise<void> {
    await this.db.execute(
      `UPDATE players SET is_online = ?, last_login = NOW() WHERE id = ?`,
      [isOnline ? 1 : 0, playerIndex]
    );
  }
}
