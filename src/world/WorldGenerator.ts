// src/world/WorldGenerator.ts
import * as mysql from 'mysql2/promise';
import * as crypto from 'crypto';

// Константы
const WORLD_SIZE = 10000;
const CELL_SIZE = 150;
const GRID_SIZE = Math.floor(WORLD_SIZE / CELL_SIZE); // ~66

// Типы клеток
enum CellType {
  EMPTY = 0,
  METALLIC = 1,
  SILICON = 2,
  ICY = 3,
  RARE = 4
}

// Интерфейс для клетки
interface Cell {
  type: CellType;
  x: number;
  y: number;
  z: number;
  age: number;
  resources: {
    metal: number;
    silicon: number;
    ice: number;
    rare: number;
  };
}

export class WorldGenerator {
  private db: mysql.Pool;
  private grid: Cell[][][] = [];
  
  constructor(dbConfig: any) {
    this.db = mysql.createPool(dbConfig);
  }
  
  /**
   * Инициализация сетки случайными значениями
   */
  private initializeGrid(seed: number, density: number = 0.3) {
    console.log('  🎲 Инициализация клеточного автомата...');
    
    const random = this.createSeededRandom(seed);
    
    for (let x = 0; x < GRID_SIZE; x++) {
      this.grid[x] = [];
      for (let y = 0; y < GRID_SIZE; y++) {
        this.grid[x][y] = [];
        for (let z = 0; z < GRID_SIZE; z++) {
          // Случайная инициализация с учетом плотности
          if (random() < density) {
            // Определяем тип на основе позиции
            const type = this.determineInitialType(x, y, z, random);
            this.grid[x][y][z] = {
              type,
              x, y, z,
              age: 0,
              resources: this.generateResources(type, x, y, z, random)
            };
          } else {
            this.grid[x][y][z] = {
              type: CellType.EMPTY,
              x, y, z,
              age: 0,
              resources: { metal: 0, silicon: 0, ice: 0, rare: 0 }
            };
          }
        }
      }
    }
  }
  
  /**
   * Создает детерминированную случайную функцию на основе seed
   */
  private createSeededRandom(seed: number): () => number {
    return function() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }
  
  /**
   * Определяет начальный тип астероида
   */
  private determineInitialType(x: number, y: number, z: number, random: () => number): CellType {
    const val = random();
    
    // Распределение: 40% металл, 30% кремний, 20% лед, 10% редкие
    if (val < 0.4) return CellType.METALLIC;
    if (val < 0.7) return CellType.SILICON;
    if (val < 0.9) return CellType.ICY;
    return CellType.RARE;
  }
  
  /**
   * Подсчет соседей по Нейману (4 направления)
   */
  private countNeumannNeighbors(x: number, y: number, z: number, type?: CellType): number {
    let count = 0;
    const dirs = [
      [1,0,0], [-1,0,0],
      [0,1,0], [0,-1,0],
      [0,0,1], [0,0,-1]
    ];
    
    for (const [dx, dy, dz] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      
      if (nx >= 0 && nx < GRID_SIZE && 
          ny >= 0 && ny < GRID_SIZE && 
          nz >= 0 && nz < GRID_SIZE) {
        const neighbor = this.grid[nx][ny][nz];
        if (neighbor.type !== CellType.EMPTY) {
          if (type === undefined || neighbor.type === type) {
            count++;
          }
        }
      }
    }
    
    return count;
  }
  
  /**
   * Подсчет соседей по Муру (все 26 направлений в 3D)
   */
  private countMooreNeighbors(x: number, y: number, z: number, type?: CellType): number {
    let count = 0;
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          
          if (nx >= 0 && nx < GRID_SIZE && 
              ny >= 0 && ny < GRID_SIZE && 
              nz >= 0 && nz < GRID_SIZE) {
            const neighbor = this.grid[nx][ny][nz];
            if (neighbor.type !== CellType.EMPTY) {
              if (type === undefined || neighbor.type === type) {
                count++;
              }
            }
          }
        }
      }
    }
    
    return count;
  }
  
  /**
   * Комбинированная проверка соседей
   */
  private checkNeighbors(x: number, y: number, z: number): {
    neumann: number;
    moore: number;
    sameType: number;
    differentTypes: Record<CellType, number>;
  } {
    // Инициализируем для всех типов, включая EMPTY
    const differentTypes = {
      [CellType.EMPTY]: 0,
      [CellType.METALLIC]: 0,
      [CellType.SILICON]: 0,
      [CellType.ICY]: 0,
      [CellType.RARE]: 0
    };
    
    let neumann = 0;
    let moore = 0;
    let sameType = 0;
    
    const currentType = this.grid[x][y][z]?.type || CellType.EMPTY;
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          
          if (nx >= 0 && nx < GRID_SIZE && 
              ny >= 0 && ny < GRID_SIZE && 
              nz >= 0 && nz < GRID_SIZE) {
            const neighbor = this.grid[nx][ny][nz];
            
            if (neighbor.type !== CellType.EMPTY) {
              moore++;
              
              // Проверка для Неймана (только ортогональные)
              if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 1) {
                neumann++;
              }
              
              if (neighbor.type === currentType) {
                sameType++;
              }
              
              differentTypes[neighbor.type]++;
            } else {
              differentTypes[CellType.EMPTY]++;
            }
          }
        }
      }
    }
    
    return {
      neumann,
      moore,
      sameType,
      differentTypes
    };
  }
  
  /**
   * Выполняет одну итерацию клеточного автомата
   */
  private evolve(): boolean {
    const newGrid: Cell[][][] = [];
    let changed = false;
    
    // Копируем текущую сетку
    for (let x = 0; x < GRID_SIZE; x++) {
      newGrid[x] = [];
      for (let y = 0; y < GRID_SIZE; y++) {
        newGrid[x][y] = [];
        for (let z = 0; z < GRID_SIZE; z++) {
          newGrid[x][y][z] = { ...this.grid[x][y][z] };
        }
      }
    }
    
    // Применяем правила
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const cell = this.grid[x][y][z];
          const neighbors = this.checkNeighbors(x, y, z);
          
          // Правила для каждого типа
          if (cell.type === CellType.EMPTY) {
            // Рождение нового астероида
            if (neighbors.moore >= 4 && neighbors.moore <= 6) {
              // Определяем тип на основе соседей
              const types = Object.entries(neighbors.differentTypes)
                .filter(([type]) => Number(type) !== CellType.EMPTY)
                .sort((a, b) => b[1] - a[1]);
              
              if (types.length > 0) {
                newGrid[x][y][z].type = Number(types[0][0]) as CellType;
                newGrid[x][y][z].age = 0;
                newGrid[x][y][z].resources = this.generateResources(
                  newGrid[x][y][z].type, x, y, z, 
                  this.createSeededRandom(x * y * z)
                );
                changed = true;
              }
            }
          } else {
            // Проверка на выживание
            cell.age++;
            
            // Разные правила для разных типов
            let survives = false;
            
            switch(cell.type) {
              case CellType.METALLIC:
                // Металл любит компанию, но не слишком много
                survives = neighbors.moore >= 2 && neighbors.moore <= 5;
                break;
              case CellType.SILICON:
                // Кремний образует кристаллические структуры
                survives = neighbors.neumann >= 2 && neighbors.moore <= 4;
                break;
              case CellType.ICY:
                // Лед может существовать в изоляции
                survives = neighbors.moore >= 1 && neighbors.moore <= 3;
                break;
              case CellType.RARE:
                // Редкие требуют особых условий
                survives = neighbors.sameType >= 2 && neighbors.moore >= 3 && neighbors.moore <= 5;
                break;
            }
            
            if (!survives) {
              newGrid[x][y][z].type = CellType.EMPTY;
              newGrid[x][y][z].resources = { metal: 0, silicon: 0, ice: 0, rare: 0 };
              changed = true;
            }
          }
        }
      }
    }
    
    this.grid = newGrid;
    return changed;
  }
  
  /**
   * Генерирует ресурсы для астероида
   */
  private generateResources(type: CellType, x: number, y: number, z: number, random: () => number): {
    metal: number; silicon: number; ice: number; rare: number;
  } {
    const baseAmount = 100 + Math.floor(random() * 200);
    const variation = 0.5 + random() * 0.5;
    
    let metal = 0, silicon = 0, ice = 0, rare = 0;
    
    switch(type) {
      case CellType.METALLIC:
        metal = Math.floor(baseAmount * 5 * variation);
        silicon = Math.floor(baseAmount * 0.5 * variation);
        break;
      case CellType.SILICON:
        silicon = Math.floor(baseAmount * 5 * variation);
        metal = Math.floor(baseAmount * 0.5 * variation);
        ice = Math.floor(baseAmount * 0.2 * variation);
        break;
      case CellType.ICY:
        ice = Math.floor(baseAmount * 4 * variation);
        metal = Math.floor(baseAmount * 0.3 * variation);
        silicon = Math.floor(baseAmount * 0.3 * variation);
        break;
      case CellType.RARE:
        rare = Math.floor(baseAmount * 2 * variation);
        metal = Math.floor(baseAmount * 1 * variation);
        silicon = Math.floor(baseAmount * 1 * variation);
        ice = Math.floor(baseAmount * 1 * variation);
        break;
    }
    
    return { metal, silicon, ice, rare };
  }
  
  /**
   * Сохраняет сетку в БД
   */
  private async saveToDatabase(worldId: string): Promise<void> {
    console.log('  💾 Сохранение в базу данных...');
    
    let asteroidCount = 0;
    const batchSize = 100;
    let batch: any[] = [];
    
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const cell = this.grid[x][y][z];
          
          if (cell.type !== CellType.EMPTY) {
            // Вычисляем реальные координаты
            const realX = (x - GRID_SIZE/2) * CELL_SIZE + CELL_SIZE/2;
            const realY = (y - GRID_SIZE/2) * CELL_SIZE + CELL_SIZE/2;
            const realZ = (z - GRID_SIZE/2) * CELL_SIZE + CELL_SIZE/2;
            
            // Название типа
            const typeName = 
              cell.type === CellType.METALLIC ? 'metallic' :
              cell.type === CellType.SILICON ? 'silicon' :
              cell.type === CellType.ICY ? 'icy' : 'rare';
            
            batch.push({
              id: crypto.randomUUID(),
              type: typeName,
              position_x: realX,
              position_y: realY,
              position_z: realZ,
              rotation_x: Math.random() * Math.PI * 2,
              rotation_y: Math.random() * Math.PI * 2,
              rotation_z: Math.random() * Math.PI * 2,
              health: 100 + cell.age,
              max_health: 120 + cell.age,
              metal_amount: cell.resources.metal,
              silicon_amount: cell.resources.silicon,
              ice_amount: cell.resources.ice,
              rare_amount: cell.resources.rare
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
  }
  
  /**
   * Вставляет батч в БД
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
   * Создает новый мир с клеточным автоматом
   */
  async createNewWorld(prevWorldNumber: number = 0): Promise<any> {
    const worldNumber = prevWorldNumber + 1;
    const worldId = crypto.randomUUID();
    const seed = Math.floor(Math.random() * 1000000);
    
    console.log(`\n🌍 Создание мира #${worldNumber}...`);
    
    // Создаем запись мира
    await this.db.execute(
      `INSERT INTO worlds (id, seed, world_number, name, status, created_at)
       VALUES (?, ?, ?, ?, 'active', NOW())`,
      [worldId, seed, worldNumber, `Мир ${worldNumber}`]
    );
    
    // Инициализация сетки
    this.initializeGrid(seed, 0.3);
    
    // Эволюция клеточного автомата (5-10 итераций)
    console.log('  🔄 Эволюция клеточного автомата...');
    for (let i = 0; i < 8; i++) {
      const changed = this.evolve();
      console.log(`  Итерация ${i+1}: ${changed ? 'изменения есть' : 'стабильно'}`);
      if (!changed) break;
    }
    
    // Сохранение в БД
    await this.saveToDatabase(worldId);
    
    console.log(`✅ Мир #${worldNumber} создан!`);
    
    return {
      id: worldId,
      worldNumber,
      seed
    };
  }
  
  /**
   * Получает статистику мира
   */
  async getWorldStats(worldId: string): Promise<any> {
    const [worlds] = await this.db.execute(
      `SELECT w.*, 
        COUNT(DISTINCT wp.player_id) as players_count,
        SUM(wp.asteroids_mined) as total_asteroids_mined,
        SUM(wp.stations_built) as total_stations_built
       FROM worlds w
       LEFT JOIN world_progress wp ON w.id = wp.world_id
       WHERE w.id = ?
       GROUP BY w.id`,
      [worldId]
    );
    
    const worldsArray = worlds as any[];
    return worldsArray[0];
  }
  
  /**
   * Закрывает соединение
   */
  async close(): Promise<void> {
    await this.db.end();
  }
}
