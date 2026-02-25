// src/world/LotkaVolterraGenerator.ts

import { dbConfig } from '../config/db.config';
import * as mysql from 'mysql2/promise';
import * as crypto from 'crypto';

// Константы
const WORLD_SIZE = 10000;
const CELL_SIZE = 200;
const GRID_SIZE = Math.floor(WORLD_SIZE / CELL_SIZE);

// Коэффициенты Лотки-Вольтерры
const LV_COEFF = {
  // Металл (жертва)
  PREY_GROWTH: 0.1,      // α - скорость размножения жертв
  PREDATION: 0.02,       // β - скорость поедания
  
  // Редкие (хищник)
  PREDATOR_GROWTH: 0.01, // δ - скорость размножения хищников от поедания
  PREDATOR_DEATH: 0.05,  // γ - естественная смертность хищников
  
  // Влияние соседей
  NEIGHBOR_INFLUENCE: 0.3
};

interface ResourcePopulations {
  metal: number;    // жертва
  silicon: number;  // промежуточный
  ice: number;      // вторичный
  rare: number;     // хищник
}

export class LotkaVolterraGenerator {
  private db: mysql.Pool;
  
  constructor(dbConfig: any) {
    this.db = mysql.createPool(dbConfig);
  }
  
  /**
   * Вычисляет популяции в точке на основе модели Лотки-Вольтерры
   */
  private calculatePopulations(x: number, y: number, z: number, time: number = 1): ResourcePopulations {
    // Нормализуем координаты для периодичности
    const nx = (x / 1000) % (2 * Math.PI);
    const ny = (y / 1000) % (2 * Math.PI);
    const nz = (z / 1000) % (2 * Math.PI);
    
    // Используем комбинации синусов и косинусов для равномерного распределения
    const metalBase = 0.5 + 0.5 * Math.sin(nx) * Math.cos(ny);
    const siliconBase = 0.5 + 0.5 * Math.cos(ny) * Math.sin(nz);
    const iceBase = 0.5 + 0.5 * Math.sin(nz) * Math.cos(nx);
    const rareBase = 0.5 + 0.5 * Math.sin(nx + ny + nz) * Math.cos(nx - ny);
    
    // Модель Лотки-Вольтерры
    let metal = metalBase;
    let silicon = siliconBase;
    let ice = iceBase;
    let rare = rareBase;
    
    // Несколько итераций для установления равновесия
    for (let t = 0; t < time * 5; t++) {
      const dt = 0.1;
      
      // Хищник (редкие) ест жертву (металл)
      const dMetal = (0.2 * metal - 0.1 * metal * rare) * dt;
      const dRare = (0.05 * metal * rare - 0.1 * rare) * dt;
      
      // Промежуточные виды
      const dSilicon = (0.15 * silicon - 0.08 * silicon * rare) * dt;
      const dIce = (0.12 * ice - 0.06 * ice * rare) * dt;
      
      metal += dMetal;
      rare += dRare;
      silicon += dSilicon;
      ice += dIce;
      
      // Не даем уйти в ноль или бесконечность
      metal = Math.max(0.1, Math.min(1.0, metal));
      silicon = Math.max(0.1, Math.min(1.0, silicon));
      ice = Math.max(0.1, Math.min(1.0, ice));
      rare = Math.max(0.05, Math.min(0.5, rare));
    }
    
    // Масштабируем до игровых значений
    return {
      metal: Math.floor(metal * 1000),
      silicon: Math.floor(silicon * 800),
      ice: Math.floor(ice * 600),
      rare: Math.floor(rare * 200)
    };
  }
  
  /**
   * Определяет тип астероида на основе популяций
   */
  private determineType(populations: ResourcePopulations): string {
    const { metal, silicon, ice, rare } = populations;
    const total = metal + silicon + ice + rare;
    
    // Находим доминирующий ресурс
    const metalRatio = metal / total;
    const siliconRatio = silicon / total;
    const iceRatio = ice / total;
    const rareRatio = rare / total;
    
    if (rareRatio > 0.3) return 'rare';
    if (iceRatio > 0.4) return 'icy';
    if (siliconRatio > 0.5) return 'silicon';
    return 'metallic';
  }
  
  /**
   * Генерирует мир на основе модели Лотки-Вольтерры
   */
  async createNewWorld(prevWorldNumber: number = 0): Promise<any> {
    const worldNumber = prevWorldNumber + 1;
    const worldId = crypto.randomUUID();
    const seed = Math.floor(Math.random() * 1000000);
    
    console.log(`\n🌍 Создание мира #${worldNumber} с моделью Лотки-Вольтерры...`);
    
    // Создаем запись мира
    await this.db.execute(
      `INSERT INTO worlds (id, seed, world_number, name, status, created_at)
       VALUES (?, ?, ?, ?, 'active', NOW())`,
      [worldId, seed, worldNumber, `Мир ${worldNumber}`]
    );
    
    // Генерируем астероиды
    await this.generateAsteroids(worldId, seed);
    
    console.log(`✅ Мир #${worldNumber} создан!`);
    
    return {
      id: worldId,
      worldNumber,
      seed
    };
  }
  
  /**
   * Генерирует астероиды с использованием Лотки-Вольтерры
   */
  private async generateAsteroids(worldId: string, seed: number): Promise<void> {
    console.log('  🔮 Генерация астероидов по модели Лотки-Вольтерры...');
    
    // Инициализируем детерминированный генератор
    const random = this.createSeededRandom(seed);
    
    let asteroidCount = 0;
    const batchSize = 100;
    let batch: any[] = [];
    
    // Проходим по всем клеткам от -GRID_SIZE/2 до GRID_SIZE/2
    const halfGrid = Math.floor(GRID_SIZE / 2);
    
    for (let ix = -halfGrid; ix < halfGrid; ix++) {
      for (let iy = -halfGrid; iy < halfGrid; iy++) {
        for (let iz = -halfGrid; iz < halfGrid; iz++) {
          
          // Вычисляем реальные координаты с небольшим случайным смещением
          const realX = ix * CELL_SIZE + (random() - 0.5) * CELL_SIZE * 0.8;
          const realY = iy * CELL_SIZE + (random() - 0.5) * CELL_SIZE * 0.8;
          const realZ = iz * CELL_SIZE + (random() - 0.5) * CELL_SIZE * 0.8;
          
          // Используем модель Лотки-Вольтерры для определения ресурсов
          // Время зависит от расстояния от центра
          const distance = Math.sqrt(realX*realX + realY*realY + realZ*realZ);
          const time = Math.max(0.1, distance / 2000); // время увеличивается с расстоянием
          
          const populations = this.calculatePopulations(realX, realY, realZ, time);
          
          // Вероятность появления астероида зависит от:
          // - общего количества ресурсов
          // - расстояния от центра (дальше - плотность меньше)
          // - случайности
          const totalResources = populations.metal + populations.silicon + populations.ice + populations.rare;
          const distanceFactor = Math.max(0, 1 - distance / 5000); // множитель от расстояния
          const spawnProbability = (totalResources / 5000) * distanceFactor * 0.5;
          
          if (random() < spawnProbability) {
            const type = this.determineType(populations);
            
            batch.push({
              id: crypto.randomUUID(),
              type: type,
              position_x: realX,
              position_y: realY,
              position_z: realZ,
              rotation_x: random() * Math.PI * 2,
              rotation_y: random() * Math.PI * 2,
              rotation_z: random() * Math.PI * 2,
              health: 100 + Math.floor(random() * 50),
              max_health: 150,
              metal_amount: populations.metal,
              silicon_amount: populations.silicon,
              ice_amount: populations.ice,
              rare_amount: populations.rare
            });
            
            asteroidCount++;
            
            if (batch.length >= batchSize) {
              await this.insertBatch(batch);
              batch = [];
              process.stdout.write('⬛');
            }
          }
        }
      }
    }
  
    if (batch.length > 0) {
      await this.insertBatch(batch);
    }
  
    console.log(`\n  ✅ Создано ${asteroidCount} астероидов`);
  
    // Покажем статистику распределения по квадрантам
    const conn = await this.db.getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT 
          SUM(CASE WHEN position_x > 0 AND position_z > 0 THEN 1 ELSE 0 END) as q1,
          SUM(CASE WHEN position_x < 0 AND position_z > 0 THEN 1 ELSE 0 END) as q2,
          SUM(CASE WHEN position_x < 0 AND position_z < 0 THEN 1 ELSE 0 END) as q3,
          SUM(CASE WHEN position_x > 0 AND position_z < 0 THEN 1 ELSE 0 END) as q4,
          SUM(CASE WHEN ABS(position_x) < 500 AND ABS(position_z) < 500 THEN 1 ELSE 0 END) as center
         FROM asteroids`
      );
    
      // Приводим к правильному типу
      const stats = rows as any[];
    
      if (stats.length > 0) {
        console.log('  📊 Распределение по квадрантам:');
        console.log(`     Q1 (+,+): ${stats[0]?.q1 || 0}`);
        console.log(`     Q2 (-,+): ${stats[0]?.q2 || 0}`);
        console.log(`     Q3 (-,-): ${stats[0]?.q3 || 0}`);
        console.log(`     Q4 (+,-): ${stats[0]?.q4 || 0}`);
        console.log(`     Центр:    ${stats[0]?.center || 0}`);
      }
    } catch (error) {
      // Игнорируем ошибки статистики
      console.log('  ⚠️ Не удалось получить статистику');
    } finally {
      conn.release();
    }
  }
  
  
  /**
   * Создает детерминированный генератор случайных чисел
   */
  private createSeededRandom(seed: number): () => number {
    return function() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }
  
  /**
   * Вставляет батч астероидов в БД
   */
  private async insertBatch(asteroids: any[]): Promise<void> {
    if (asteroids.length === 0) return;
    
    const values = asteroids.map(a => 
      `('${a.id}', NULL, '${a.type}', 
        ${a.position_x}, ${a.position_y}, ${a.position_z},
        ${a.rotation_x}, ${a.rotation_y}, ${a.rotation_z},
        ${a.health}, ${a.max_health},
        ${a.metal_amount}, ${a.silicon_amount}, ${a.ice_amount}, ${a.rare_amount},
        0, NOW())`
    ).join(',');
    
    await this.db.execute(
      `INSERT INTO asteroids (
        id, field_id, type,
        position_x, position_y, position_z,
        rotation_x, rotation_y, rotation_z,
        health, max_health,
        metal_amount, silicon_amount, ice_amount, rare_amount,
        is_depleted, created_at
      ) VALUES ${values}`
    );
  }
  
  /**
   * Закрывает соединение
   */
  async close(): Promise<void> {
    await this.db.end();
  }
}
