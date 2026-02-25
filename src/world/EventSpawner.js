// world/EventSpawner.js
class EventSpawner {
  constructor(db, worldGenerator) {
    this.db = db;
    this.worldGenerator = worldGenerator;
    this.eventTypes = {
      pirate_attack: this.spawnPirateAttack.bind(this),
      comet: this.spawnComet.bind(this),
      patrol: this.spawnPatrol.bind(this),
      trade_fleet: this.spawnTradeFleet.bind(this),
      alien_artifact: this.spawnAlienArtifact.bind(this)
    };
  }
  
  async spawnEvent(worldId, eventType, position) {
    const eventId = crypto.randomUUID();
    const eventData = await this.eventTypes[eventType](worldId, position);
    
    await this.db.execute(
      `INSERT INTO world_events (
        id, world_id, event_type, event_name,
        position_x, position_y, position_z,
        start_time, data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [
        eventId,
        worldId,
        eventType,
        eventData.name,
        position.x,
        position.y,
        position.z,
        JSON.stringify(eventData)
      ]
    );
    
    return eventId;
  }
  
  async spawnPirateAttack(worldId, position) {
    // Генерируем пиратский рейд
    const strength = 50 + Math.floor(Math.random() * 100);
    return {
      name: `Пиратский рейд (сила ${strength})`,
      strength: strength,
      rewards: {
        metal: strength * 10,
        rare: strength
      },
      duration: 30 * 60 * 1000 // 30 минут
    };
  }
  
  async spawnComet(worldId, position) {
    // Комета с редкими ресурсами
    return {
      name: 'Редкая комета',
      resources: {
        rare: 500 + Math.floor(Math.random() * 500)
      },
      speed: 5 + Math.random() * 5,
      direction: {
        x: Math.random() - 0.5,
        y: Math.random() - 0.5,
        z: Math.random() - 0.5
      }
    };
  }
  
  async spawnPatrol(worldId, position) {
    // Патруль, который защищает сектор
    return {
      name: 'Космический патруль',
      strength: 200,
      protection_radius: 300,
      duration: 60 * 60 * 1000 // 1 час
    };
  }
  
  async spawnTradeFleet(worldId, position) {
    // Торговая флотилия с выгодными предложениями
    return {
      name: 'Торговая флотилия',
      offers: [
        { give: { metal: 100 }, take: { silicon: 80 } },
        { give: { rare: 10 }, take: { metal: 500 } }
      ],
      duration: 15 * 60 * 1000 // 15 минут
    };
  }
  
  async spawnAlienArtifact(worldId, position) {
    // Инопланетный артефакт с уникальными бонусами
    return {
      name: 'Древний артефакт',
      bonus: {
        mining_speed: 1.5,
        shield_regen: 2
      },
      research_time: 60 * 60 * 1000 // 1 час на исследование
    };
  }
  
  async updateEvents() {
    // Проверяем и обновляем активные события
    const [activeEvents] = await this.db.execute(
      `SELECT * FROM world_events 
       WHERE is_active = TRUE AND end_time < NOW()`
    );
    
    for (const event of activeEvents) {
      await this.db.execute(
        'UPDATE world_events SET is_active = FALSE WHERE id = ?',
        [event.id]
      );
      
      console.log(`⏰ Событие ${event.event_name} завершено`);
    }
  }
}
