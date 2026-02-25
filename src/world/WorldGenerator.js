// world/WorldGenerator.js
const crypto = require('crypto');
const SimplexNoise = require('simplex-noise');

class WorldGenerator {
  constructor(db) {
    this.db = db;
  }
  
  async createNewWorld(prevWorldNumber = 0) {
    const worldNumber = prevWorldNumber + 1;
    const seed = Math.floor(Math.random() * 1000000);
    const worldId = crypto.randomUUID();
    
    // Определяем сложность и особенности на основе номера мира
    const difficulty = this.calculateDifficulty(worldNumber);
    const features = this.generateFeatures(worldNumber, seed);
    
    await this.db.execute(
      `INSERT INTO worlds (id, seed, world_number, name, difficulty_level, special_features, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        worldId, 
        seed, 
        worldNumber, 
        `Мир ${worldNumber}`,
        difficulty,
        JSON.stringify(features)
      ]
    );
    
    console.log(`✨ Создан новый мир #${worldNumber} с сидом ${seed}`);
    console.log(`   Сложность: ${difficulty}, Особенности:`, features);
    
    return { worldId, worldNumber, seed, difficulty, features };
  }
  
  calculateDifficulty(worldNumber) {
    // Сложность растет с каждым миром
    const baseDifficulty = 1;
    const increment = 0.2;
    return baseDifficulty + (worldNumber - 1) * increment;
  }
  
  generateFeatures(worldNumber, seed) {
    const noise = new SimplexNoise(seed);
    const features = [];
    
    // С каждым миром добавляются новые механики
    if (worldNumber >= 2) {
      features.push('pirate_raids');
    }
    if (worldNumber >= 3) {
      features.push('comets');
    }
    if (worldNumber >= 4) {
      features.push('patrols');
    }
    if (worldNumber >= 5) {
      features.push('trade_routes');
    }
    if (worldNumber >= 6) {
      features.push('alien_artifacts');
    }
    
    // Рандомные особенности на основе шума
    if (noise.noise2D(worldNumber, 0) > 0.7) {
      features.push('double_resources');
    }
    if (noise.noise2D(worldNumber, 100) > 0.7) {
      features.push('dangerous_zone');
    }
    
    return features;
  }
  
  async completeWorld(worldId, completedBy) {
    await this.db.execute(
      `UPDATE worlds 
       SET status = 'completed', completed_at = NOW(), completed_by = ?
       WHERE id = ?`,
      [completedBy, worldId]
    );
    
    // Обновляем legacy игроков
    await this.updatePlayerLegacy(worldId);
    
    // Создаем новый мир
    const [world] = await this.db.execute('SELECT world_number FROM worlds WHERE id = ?', [worldId]);
    const newWorld = await this.createNewWorld(world[0].world_number);
    
    return newWorld;
  }
  
  async updatePlayerLegacy(worldId) {
    // Получаем всех игроков в этом мире
    const [players] = await this.db.execute(
      `SELECT wp.*, p.username 
       FROM world_progress wp
       JOIN players p ON wp.player_id = p.id
       WHERE wp.world_id = ?`,
      [worldId]
    );
    
    for (const player of players) {
      // Обновляем или создаем legacy запись
      await this.db.execute(
        `INSERT INTO player_legacy (
          player_id, total_worlds_completed, 
          total_resources_gathered, total_stations_built,
          total_asteroids_mined, total_distance_traveled,
          prestige_level
        ) VALUES (?, 1, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          total_worlds_completed = total_worlds_completed + 1,
          total_resources_gathered = JSON_MERGE_PRESERVE(total_resources_gathered, VALUES(total_resources_gathered)),
          total_stations_built = total_stations_built + VALUES(total_stations_built),
          total_asteroids_mined = total_asteroids_mined + VALUES(total_asteroids_mined),
          total_distance_traveled = total_distance_traveled + VALUES(total_distance_traveled),
          prestige_level = prestige_level + 1`,
        [
          player.player_id,
          player.resources_gathered || '{}',
          player.stations_built || 0,
          player.asteroids_mined || 0,
          player.distance_traveled || 0
        ]
      );
      
      console.log(`🏆 Игрок ${player.username} получил +1 престиж!`);
    }
  }
}
