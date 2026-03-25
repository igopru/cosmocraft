// src/server/storage/DatabaseManager.ts
import mysql from 'mysql2/promise';
import { dbConfig } from '../../config/db.config';

export class DatabaseManager {
  private pool: mysql.Pool;
  
  constructor() {
    this.pool = mysql.createPool(dbConfig);
  }
  
  /**
   * Получить игрока по ID
   */
  async getPlayer(playerId: string) {
    const [rows] = await this.pool.execute(
      `SELECT p.*, 
        JSON_OBJECT(
          'metal', pr_metal.amount,
          'silicon', pr_silicon.amount,
          'ice', pr_ice.amount,
          'rare', pr_rare.amount
        ) as resources
       FROM players p
       LEFT JOIN player_resources pr_metal ON p.id = pr_metal.player_id AND pr_metal.resource_type = 'metal'
       LEFT JOIN player_resources pr_silicon ON p.id = pr_silicon.player_id AND pr_silicon.resource_type = 'silicon'
       LEFT JOIN player_resources pr_ice ON p.id = pr_ice.player_id AND pr_ice.resource_type = 'ice'
       LEFT JOIN player_resources pr_rare ON p.id = pr_rare.player_id AND pr_rare.resource_type = 'rare'
       WHERE p.id = ?`,
      [playerId]
    );
    
    return (rows as any[])[0];
  }
  
  /**
   * Сохранить игрока
   */
  async savePlayer(playerId: string, playerData: any) {
    const connection = await this.pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Обновляем игрока
      await connection.execute(
        `UPDATE players SET
          username = ?,
          current_sector_id = ?,
          position_x = ?,
          position_y = ?,
          position_z = ?,
          last_login = NOW()
         WHERE id = ?`,
        [
          playerData.name,
          playerData.sector,
          playerData.position.x,
          playerData.position.y,
          playerData.position.z,
          playerId
        ]
      );
      
      // Обновляем ресурсы
      for (const [type, amount] of Object.entries(playerData.resources)) {
        await connection.execute(
          `INSERT INTO player_resources (player_id, resource_type, amount)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
          [playerId, type, amount as number]
        );
      }
      
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  
  /**
   * Получить астероиды в радиусе
   */
  async getAsteroidsInRange(centerX: number, centerY: number, centerZ: number, radius: number) {
    const [rows] = await this.pool.execute(
      `SELECT * FROM asteroids
       WHERE is_depleted = FALSE
       AND SQRT(POW(position_x - ?, 2) + POW(position_y - ?, 2) + POW(position_z - ?, 2)) < ?
       ORDER BY SQRT(POW(position_x - ?, 2) + POW(position_y - ?, 2) + POW(position_z - ?, 2))
       LIMIT 100`,
      [centerX, centerY, centerZ, radius, centerX, centerY, centerZ]
    );
    
    return rows;
  }
  
  /**
   * Получить активный мир
   */
  async getActiveWorld() {
    const [rows] = await this.pool.execute(
      `SELECT * FROM worlds WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`
    );
    
    return (rows as any[])[0];
  }
  
  /**
   * Создать новый мир
   */
  async createWorld(worldData: any) {
    const [result] = await this.pool.execute(
      `INSERT INTO worlds (id, seed, world_number, name, status, created_at)
       VALUES (?, ?, ?, ?, 'active', NOW())`,
      [worldData.id, worldData.seed, worldData.worldNumber, worldData.name]
    );
    
    return result;
  }
  
  /**
   * Обновить прогресс игрока в мире
   */
  async updateWorldProgress(playerId: string, worldId: string, data: any) {
    await this.pool.execute(
      `INSERT INTO world_progress (player_id, world_id, resources_gathered, stations_built, asteroids_mined, distance_traveled)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        resources_gathered = JSON_MERGE_PRESERVE(resources_gathered, VALUES(resources_gathered)),
        stations_built = stations_built + VALUES(stations_built),
        asteroids_mined = asteroids_mined + VALUES(asteroids_mined),
        distance_traveled = distance_traveled + VALUES(distance_traveled)`,
      [
        playerId,
        worldId,
        JSON.stringify(data.resources || {}),
        data.stationsBuilt || 0,
        data.asteroidsMined || 0,
        data.distanceTraveled || 0
      ]
    );
  }
  
  /**
   * Получить наследие игрока
   */
  async getPlayerLegacy(playerId: string) {
    const [rows] = await this.pool.execute(
      `SELECT * FROM player_legacy WHERE player_id = ?`,
      [playerId]
    );
    
    return (rows as any[])[0];
  }
  
  /**
   * Получить соединение
   */
  async getConnection() {
    return await this.pool.getConnection();
  }

  /**
   * Закрыть соединение
   */
  async close() {
    await this.pool.end();
  }

  /**
   * Выполнить SQL запрос (для общего доступа)
   */
  async execute(query: string, values?: any[]) {
    return await this.pool.execute(query, values);
  }

  /**
   * Инициализировать ресурсы нового игрока
   */
  async initializePlayerResources(playerId: string) {
    const resources = [
      { type: 'metal', amount: 1000 },
      { type: 'silicon', amount: 500 },
      { type: 'ice', amount: 300 },
      { type: 'rare', amount: 100 }
    ];

    for (const resource of resources) {
      await this.pool.execute(
        `INSERT INTO player_resources (player_id, resource_type, amount)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
        [playerId, resource.type, resource.amount]
      );
    }
  }

  /**
   * Получить ресурсы игрока
   */
  async getPlayerResources(playerId: string) {
    const [rows] = await this.pool.execute(
      `SELECT resource_type, amount FROM player_resources WHERE player_id = ?`,
      [playerId]
    );

    const resources: Record<string, number> = {};
    (rows as any[]).forEach(row => {
      resources[row.resource_type] = row.amount;
    });

    return resources;
  }

  /**
   * Обновить ресурсы игрока
   */
  async updatePlayerResources(playerId: string, resources: Record<string, number>) {
    for (const [type, amount] of Object.entries(resources)) {
      await this.pool.execute(
        `INSERT INTO player_resources (player_id, resource_type, amount)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
        [playerId, type, amount]
      );
    }
  }
}
