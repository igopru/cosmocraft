// src/server/services/MissionService.ts
import { DatabaseManager } from '../storage/DatabaseManager';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Тип задания
 */
export type MissionType = 'quiz' | 'flight' | 'search' | 'collect' | 'visit';
export type MissionCategory = 'history' | 'science' | 'exploration' | 'special' | 'quiz';
export type MissionDifficulty = 'easy' | 'medium' | 'hard' | 'legendary';
export type MissionStatus = 'available' | 'in_progress' | 'completed' | 'failed';

/**
 * Интерфейс задания
 */
export interface Mission {
  id: string;
  title: string;
  description: string;
  category: MissionCategory;
  type: MissionType;
  difficulty: MissionDifficulty;
  question: string | null;
  options: string[] | null;
  correct_answer: number | null;
  target_coordinates: { x: number; y: number; z: number } | null;
  target_radius: number | null;
  target_object_type: string | null;
  required_count: number;
  reward_xp: number;
  reward_fuel: number;
  reward_metal: number;
  reward_silicon: number;
  reward_ice: number;
  reward_rare: number;
  reward_rank_title: string | null;
  reward_rank_level: number | null;
  is_active: boolean;
  is_repeatable: boolean;
  prerequisite_mission_id: string | null;
  time_limit_seconds: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Прогресс пилота по заданию
 */
export interface PilotMissionProgress {
  id: string;
  player_id: string;
  mission_id: string;
  status: MissionStatus;
  progress: any | null;
  started_at: string | null;
  completed_at: string | null;
  attempts_count: number;
  last_attempt_at: string | null;
}

/**
 * Награда за задание
 */
export interface MissionReward {
  xp: number;
  fuel: number;
  metal: number;
  silicon: number;
  ice: number;
  rare: number;
  rankTitle: string | null;
}

/**
 * Ранг пилота
 */
export interface PilotRank {
  id: string;
  title: string;
  required_xp: number;
  icon: string | null;
  color: string;
  description: string | null;
  sort_order: number;
}

/**
 * Прогресс ранга пилота
 */
export interface PilotRankProgress {
  player_id: string;
  current_rank_id: string | null;
  total_xp: number;
  missions_completed: number;
  last_rank_up_at: string | null;
}

/**
 * Результат выполнения задания
 */
export interface MissionCompleteResult {
  success: boolean;
  message: string;
  reward: MissionReward | null;
  newRank: PilotRank | null;
  progress: PilotMissionProgress | null;
}

/**
 * MissionService — управление заданиями, прогрессом и наградами
 */
export class MissionService {
  private db: DatabaseManager;
  private playerDataPath: string;

  constructor(db: DatabaseManager) {
    this.db = db;
    this.playerDataPath = path.resolve(__dirname, '../../../players');
  }

  // ============================================================
  // ПОЛУЧЕНИЕ ЗАДАНИЙ
  // ============================================================

  /**
   * Получить все активные задания
   */
  async getAllMissions(category?: MissionCategory, difficulty?: MissionDifficulty): Promise<Mission[]> {
    let query = 'SELECT * FROM missions WHERE is_active = 1';
    const params: any[] = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (difficulty) {
      query += ' AND difficulty = ?';
      params.push(difficulty);
    }

    query += ' ORDER BY sort_order ASC, difficulty ASC';

    const [rows] = await this.db.execute(query, params) as any;
    return rows.map((row: any) => this.parseMission(row));
  }

  /**
   * Получить одно задание по ID
   */
  async getMissionById(id: string): Promise<Mission | null> {
    const [rows] = await this.db.execute('SELECT * FROM missions WHERE id = ?', [id]) as any;
    if (rows.length === 0) return null;
    return this.parseMission(rows[0]);
  }

  /**
   * Получить задания с прогрессом пилота
   */
  async getPlayerMissions(playerId: string): Promise<any[]> {
    const query = `
      SELECT 
        m.*,
        mp.status as player_status,
        mp.progress as player_progress,
        mp.started_at,
        mp.completed_at,
        mp.attempts_count
      FROM missions m
      LEFT JOIN pilot_mission_progress mp ON m.id = mp.mission_id AND mp.player_id = ?
      WHERE m.is_active = 1
      ORDER BY m.sort_order ASC, m.difficulty ASC
    `;

    const [rows] = await this.db.execute(query, [playerId]) as any;
    return rows.map((row: any) => {
      // mysql2 автоматически парсит JSON поля
      let playerProg = row.player_progress;
      if (typeof playerProg === 'string') {
        try { playerProg = JSON.parse(playerProg); } catch (e) { playerProg = null; }
      } else if (typeof playerProg !== 'object' || playerProg === null) {
        playerProg = null;
      }

      return {
        ...this.parseMission(row),
        playerStatus: row.player_status || 'available',
        playerProgress: playerProg,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        attemptsCount: row.attempts_count || 0,
      };
    });
  }

  // ============================================================
  // ПРОГРЕСС ЗАДАНИЙ
  // ============================================================

  /**
   * Начать задание
   */
  async startMission(playerId: string, missionId: string): Promise<{ success: boolean; message: string }> {
    const mission = await this.getMissionById(missionId);
    if (!mission) {
      return { success: false, message: 'Задание не найдено' };
    }

    // Проверить пререквизиты
    if (mission.prerequisite_mission_id) {
      const [rows] = await this.db.execute(
        'SELECT status FROM pilot_mission_progress WHERE player_id = ? AND mission_id = ?',
        [playerId, mission.prerequisite_mission_id]
      ) as any;

      if (rows.length === 0 || rows[0].status !== 'completed') {
        return { success: false, message: 'Сначала выполните предыдущее задание' };
      }
    }

    // Проверить, не повторяемое ли задание (если уже выполнено)
    if (!mission.is_repeatable) {
      const [rows] = await this.db.execute(
        'SELECT status FROM pilot_mission_progress WHERE player_id = ? AND mission_id = ? AND status = ?',
        [playerId, missionId, 'completed']
      ) as any;

      if (rows.length > 0) {
        return { success: false, message: 'Это задание уже выполнено' };
      }
    }

    // Создать или обновить прогресс
    const [existing] = await this.db.execute(
      'SELECT id FROM pilot_mission_progress WHERE player_id = ? AND mission_id = ?',
      [playerId, missionId]
    ) as any;

    if (existing.length > 0) {
      await this.db.execute(
        `UPDATE pilot_mission_progress 
         SET status = 'in_progress', 
             started_at = NOW(),
             attempts_count = attempts_count + 1,
             last_attempt_at = NOW()
         WHERE player_id = ? AND mission_id = ?`,
        [playerId, missionId]
      );
    } else {
      const progressId = this.generateId();
      await this.db.execute(
        `INSERT INTO pilot_mission_progress (id, player_id, mission_id, status, started_at, attempts_count, last_attempt_at)
         VALUES (?, ?, ?, 'in_progress', NOW(), 1, NOW())`,
        [progressId, playerId, missionId]
      );
    }

    return { success: true, message: 'Задание начато!' };
  }

  /**
   * Отправить ответ на викторину
   */
  async submitQuizAnswer(playerId: string, missionId: string, selectedAnswer: number): Promise<MissionCompleteResult> {
    const mission = await this.getMissionById(missionId);
    if (!mission || mission.type !== 'quiz') {
      return this.errorResult('Задание не найдено или не является викториной');
    }

    if (!mission.options || mission.correct_answer === null) {
      return this.errorResult('Задание не имеет вариантов ответа');
    }

    // Проверить, не выполнено ли уже задание
    const existingProgress = await this.getPlayerMissionProgress(playerId, missionId);
    if (existingProgress && existingProgress.status === 'completed') {
      return this.errorResult('Это задание уже выполнено');
    }

    const isCorrect = selectedAnswer === mission.correct_answer;

    // Сохранить прогресс
    await this.updateMissionProgress(playerId, missionId, {
      answer_selected: selectedAnswer,
      is_correct: isCorrect,
      submitted_at: new Date().toISOString(),
    });

    if (!isCorrect) {
      // Неверный ответ — можно попробовать снова
      return {
        success: false,
        message: 'Неверный ответ! Попробуйте ещё раз.',
        reward: null,
        newRank: null,
        progress: await this.getPlayerMissionProgress(playerId, missionId),
      };
    }

    // Верный ответ — завершить задание
    return await this.completeMission(playerId, missionId);
  }

  /**
   * Обновить прогресс по заданию на полёт/поиск
   */
  async updateFlightProgress(playerId: string, missionId: string, progressData: any): Promise<{ success: boolean; message: string; completed?: boolean }> {
    const mission = await this.getMissionById(missionId);
    if (!mission || (mission.type !== 'flight' && mission.type !== 'search' && mission.type !== 'visit')) {
      return { success: false, message: 'Задание не найдено' };
    }

    const currentProgress = await this.getPlayerMissionProgress(playerId, missionId);
    const visitedLocations = currentProgress?.progress?.visited_locations || [];
    const objectsFound = currentProgress?.progress?.objects_found || 0;

    // Добавить новую локацию
    if (progressData.location && !visitedLocations.find((loc: any) => 
      Math.abs(loc.x - progressData.location.x) < 10 && 
      Math.abs(loc.y - progressData.location.y) < 10 && 
      Math.abs(loc.z - progressData.location.z) < 10
    )) {
      visitedLocations.push(progressData.location);
    }

    // Увеличить счётчик найденных объектов
    const newObjectsFound = objectsFound + (progressData.objects_found || 0);

    const updatedProgress = {
      visited_locations: visitedLocations,
      objects_found: newObjectsFound,
      last_update: new Date().toISOString(),
    };

    await this.updateMissionProgress(playerId, missionId, updatedProgress);

    // Проверить, выполнено ли задание
    const requiredCount = mission.required_count || 1;
    const completed = newObjectsFound >= requiredCount || visitedLocations.length >= requiredCount;

    if (completed) {
      const result = await this.completeMission(playerId, missionId);
      return { 
        success: true, 
        message: result.message, 
        completed: true 
      };
    }

    return { 
      success: true, 
      message: `Прогресс: ${Math.max(newObjectsFound, visitedLocations.length)}/${requiredCount}`, 
      completed: false 
    };
  }

  /**
   * Проверить, находится ли игрок в зоне цели задания
   */
  async checkProximityToTarget(playerId: string, missionId: string, playerX: number, playerY: number, playerZ: number): Promise<{ inZone: boolean; distance: number; mission: Mission | null }> {
    const mission = await this.getMissionById(missionId);
    if (!mission || !mission.target_coordinates) {
      return { inZone: false, distance: Infinity, mission };
    }

    const dx = playerX - mission.target_coordinates.x;
    const dy = playerY - mission.target_coordinates.y;
    const dz = playerZ - mission.target_coordinates.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const inZone = mission.target_radius ? distance <= mission.target_radius : false;

    return { inZone, distance, mission };
  }

  // ============================================================
  // ЗАВЕРШЕНИЕ И НАГРАДЫ
  // ============================================================

  /**
   * Завершить задание и выдать награды
   */
  async completeMission(playerId: string, missionId: string): Promise<MissionCompleteResult> {
    const mission = await this.getMissionById(missionId);
    if (!mission) {
      return this.errorResult('Задание не найдено');
    }

    // Проверить, не выполнено ли уже (защита от дублирования наград)
    const existing = await this.getPlayerMissionProgress(playerId, missionId);
    if (existing && existing.status === 'completed') {
      return this.errorResult('Это задание уже выполнено');
    }

    // Обновить или создать запись прогресса
    if (existing) {
      await this.db.execute(
        `UPDATE pilot_mission_progress
         SET status = 'completed', completed_at = NOW()
         WHERE player_id = ? AND mission_id = ?`,
        [playerId, missionId]
      );
    } else {
      const progressId = this.generateId();
      await this.db.execute(
        `INSERT INTO pilot_mission_progress (id, player_id, mission_id, status, started_at, completed_at, attempts_count)
         VALUES (?, ?, ?, 'completed', NOW(), NOW(), 1)`,
        [progressId, playerId, missionId]
      );
    }

    // Выдать награды
    const reward: MissionReward = {
      xp: mission.reward_xp,
      fuel: mission.reward_fuel,
      metal: mission.reward_metal,
      silicon: mission.reward_silicon,
      ice: mission.reward_ice,
      rare: mission.reward_rare,
      rankTitle: mission.reward_rank_title,
    };

    await this.giveRewards(playerId, reward);

    // Обновить XP и ранг
    const newRank = await this.updatePlayerRank(playerId, mission.reward_xp);

    // Сохранить прогресс в JSON файл пилота
    await this.savePilotMissionProgress(playerId);

    const progress = await this.getPlayerMissionProgress(playerId, missionId);

    let message = `✅ Задание "${mission.title}" выполнено!`;
    const rewardParts = [];
    if (reward.xp > 0) rewardParts.push(`+${reward.xp} XP`);
    if (reward.fuel > 0) rewardParts.push(`+${reward.fuel} топлива`);
    if (reward.metal > 0) rewardParts.push(`+${reward.metal} металла`);
    if (reward.silicon > 0) rewardParts.push(`+${reward.silicon} кремния`);
    if (reward.ice > 0) rewardParts.push(`+${reward.ice} льда`);
    if (reward.rare > 0) rewardParts.push(`+${reward.rare} редких`);
    if (rewardParts.length > 0) message += `\n🎁 Награды: ${rewardParts.join(', ')}`;
    if (newRank) message += `\n🏆 Новый ранг: ${newRank.title} ${newRank.icon || ''}`;

    return {
      success: true,
      message,
      reward,
      newRank,
      progress,
    };
  }

  /**
   * Выдать награды пилоту
   */
  private async giveRewards(playerId: string, reward: MissionReward): Promise<void> {
    // Ресурсы через player_resources
    const resources = [
      { type: 'metal', amount: reward.metal },
      { type: 'silicon', amount: reward.silicon },
      { type: 'ice', amount: reward.ice },
      { type: 'rare', amount: reward.rare },
    ];

    for (const res of resources) {
      if (res.amount > 0) {
        await this.db.execute(
          `INSERT INTO player_resources (player_id, resource_type, amount)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE amount = amount + ?`,
          [playerId, res.type, res.amount, res.amount]
        );
      }
    }

    // Топливо — можно хранить в JSON пилота или в отдельной таблице
    // Для простоты сохраняем в JSON файл пилота
    if (reward.fuel > 0) {
      await this.addPilotResource(playerId, 'fuel', reward.fuel);
    }
  }

  /**
   * Обновить ранг пилота
   */
  private async updatePlayerRank(playerId: string, xpGained: number): Promise<PilotRank | null> {
    // Получить или создать прогресс
    let [rows] = await this.db.execute(
      'SELECT * FROM pilot_rank_progress WHERE player_id = ?',
      [playerId]
    ) as any;

    if (rows.length === 0) {
      await this.db.execute(
        'INSERT INTO pilot_rank_progress (player_id, total_xp, missions_completed) VALUES (?, 0, 0)',
        [playerId]
      );
      rows = [{ total_xp: 0, missions_completed: 0, current_rank_id: null }];
    }

    // Обновить XP
    const totalXP = (rows[0].total_xp || 0) + xpGained;
    await this.db.execute(
      'UPDATE pilot_rank_progress SET total_xp = ?, missions_completed = missions_completed + 1 WHERE player_id = ?',
      [totalXP, playerId]
    );

    // Найти подходящий ранг
    const [ranks] = await this.db.execute(
      'SELECT * FROM pilot_ranks WHERE required_xp <= ? ORDER BY required_xp DESC LIMIT 1',
      [totalXP]
    ) as any;

    if (ranks.length > 0) {
      const newRank = ranks[0];
      const oldRankId = rows[0].current_rank_id;

      if (oldRankId !== newRank.id) {
        await this.db.execute(
          'UPDATE pilot_rank_progress SET current_rank_id = ?, last_rank_up_at = NOW() WHERE player_id = ?',
          [newRank.id, playerId]
        );

        return {
          id: newRank.id,
          title: newRank.title,
          required_xp: newRank.required_xp,
          icon: newRank.icon,
          color: newRank.color,
          description: newRank.description,
          sort_order: newRank.sort_order,
        };
      }
    }

    return null;
  }

  // ============================================================
  // JSON ПРОГРЕСС ПИЛОТА
  // ============================================================

  /**
   * Сохранить прогресс заданий пилота в JSON файл
   */
  async savePilotMissionProgress(playerId: string): Promise<void> {
    const pilotDir = this.getPilotDirectory(playerId);
    if (!fs.existsSync(pilotDir)) {
      fs.mkdirSync(pilotDir, { recursive: true });
    }

    const missionsPath = path.join(pilotDir, 'missions_progress.json');
    const rankPath = path.join(pilotDir, 'rank_progress.json');

    // Получить все задания с прогрессом
    const missions = await this.getPlayerMissions(playerId);
    const completedMissions = missions.filter((m: any) => m.playerStatus === 'completed');

    await fs.promises.writeFile(missionsPath, JSON.stringify({
      player_id: playerId,
      updated_at: new Date().toISOString(),
      total_completed: completedMissions.length,
      missions: missions.map((m: any) => ({
        id: m.id,
        title: m.title,
        status: m.playerStatus,
        progress: m.playerProgress,
        completed_at: m.completedAt,
        attempts: m.attemptsCount,
      })),
    }, null, 2), 'utf-8');

    // Сохранить ранг
    const [rankRows] = await this.db.execute(
      `SELECT pr.*, r.title, r.icon, r.color 
       FROM pilot_rank_progress pr
       LEFT JOIN pilot_ranks r ON pr.current_rank_id = r.id
       WHERE pr.player_id = ?`,
      [playerId]
    ) as any;

    if (rankRows.length > 0) {
      const rankData = rankRows[0];
      await fs.promises.writeFile(rankPath, JSON.stringify({
        player_id: playerId,
        total_xp: rankData.total_xp,
        missions_completed: rankData.missions_completed,
        current_rank: {
          id: rankData.current_rank_id,
          title: rankData.title,
          icon: rankData.icon,
          color: rankData.color,
        },
        updated_at: new Date().toISOString(),
      }, null, 2), 'utf-8');
    }
  }

  /**
   * Добавить ресурс пилоту (например, топливо)
   */
  private async addPilotResource(playerId: string, resource: string, amount: number): Promise<void> {
    const pilotDir = this.getPilotDirectory(playerId);
    if (!fs.existsSync(pilotDir)) {
      fs.mkdirSync(pilotDir, { recursive: true });
    }

    const resourcesPath = path.join(pilotDir, 'resources.json');
    let resources: any = {};

    if (fs.existsSync(resourcesPath)) {
      resources = JSON.parse(fs.readFileSync(resourcesPath, 'utf-8'));
    }

    resources[resource] = (resources[resource] || 0) + amount;
    resources.updated_at = new Date().toISOString();

    await fs.promises.writeFile(resourcesPath, JSON.stringify(resources, null, 2), 'utf-8');
  }

  // ============================================================
  // АДМИНСКИЕ ОПЕРАЦИИ
  // ============================================================

  /**
   * Создать новое задание
   */
  async createMission(data: Partial<Mission>): Promise<{ success: boolean; message: string; mission: Mission | null }> {
    const id = data.id || `mission_${this.generateId().substring(0, 8)}`;
    
    try {
      await this.db.execute(
        `INSERT INTO missions (
          id, title, description, category, type, difficulty,
          question, options, correct_answer,
          target_coordinates, target_radius, target_object_type, required_count,
          reward_xp, reward_fuel, reward_metal, reward_silicon, reward_ice, reward_rare,
          reward_rank_title, reward_rank_level,
          is_active, is_repeatable, prerequisite_mission_id, time_limit_seconds, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.title || '',
          data.description || '',
          data.category || 'quiz',
          data.type || 'quiz',
          data.difficulty || 'easy',
          data.question || null,
          data.options ? JSON.stringify(data.options) : null,
          data.correct_answer || null,
          data.target_coordinates ? JSON.stringify(data.target_coordinates) : null,
          data.target_radius || null,
          data.target_object_type || null,
          data.required_count || 1,
          data.reward_xp || 0,
          data.reward_fuel || 0,
          data.reward_metal || 0,
          data.reward_silicon || 0,
          data.reward_ice || 0,
          data.reward_rare || 0,
          data.reward_rank_title || null,
          data.reward_rank_level || null,
          data.is_active !== undefined ? data.is_active : 1,
          data.is_repeatable !== undefined ? data.is_repeatable : 0,
          data.prerequisite_mission_id || null,
          data.time_limit_seconds || null,
          data.sort_order || 0,
        ]
      );

      const mission = await this.getMissionById(id);
      return { success: true, message: 'Задание создано!', mission };
    } catch (error: any) {
      return { success: false, message: error.message, mission: null };
    }
  }

  /**
   * Обновить задание
   */
  async updateMission(id: string, data: Partial<Mission>): Promise<{ success: boolean; message: string }> {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
    if (data.type !== undefined) { fields.push('type = ?'); values.push(data.type); }
    if (data.difficulty !== undefined) { fields.push('difficulty = ?'); values.push(data.difficulty); }
    if (data.question !== undefined) { fields.push('question = ?'); values.push(data.question); }
    if (data.options !== undefined) { fields.push('options = ?'); values.push(JSON.stringify(data.options)); }
    if (data.correct_answer !== undefined) { fields.push('correct_answer = ?'); values.push(data.correct_answer); }
    if (data.target_coordinates !== undefined) { fields.push('target_coordinates = ?'); values.push(JSON.stringify(data.target_coordinates)); }
    if (data.target_radius !== undefined) { fields.push('target_radius = ?'); values.push(data.target_radius); }
    if (data.target_object_type !== undefined) { fields.push('target_object_type = ?'); values.push(data.target_object_type); }
    if (data.required_count !== undefined) { fields.push('required_count = ?'); values.push(data.required_count); }
    if (data.reward_xp !== undefined) { fields.push('reward_xp = ?'); values.push(data.reward_xp); }
    if (data.reward_fuel !== undefined) { fields.push('reward_fuel = ?'); values.push(data.reward_fuel); }
    if (data.reward_metal !== undefined) { fields.push('reward_metal = ?'); values.push(data.reward_metal); }
    if (data.reward_silicon !== undefined) { fields.push('reward_silicon = ?'); values.push(data.reward_silicon); }
    if (data.reward_ice !== undefined) { fields.push('reward_ice = ?'); values.push(data.reward_ice); }
    if (data.reward_rare !== undefined) { fields.push('reward_rare = ?'); values.push(data.reward_rare); }
    if (data.reward_rank_title !== undefined) { fields.push('reward_rank_title = ?'); values.push(data.reward_rank_title); }
    if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active); }
    if (data.is_repeatable !== undefined) { fields.push('is_repeatable = ?'); values.push(data.is_repeatable); }
    if (data.prerequisite_mission_id !== undefined) { fields.push('prerequisite_mission_id = ?'); values.push(data.prerequisite_mission_id); }
    if (data.time_limit_seconds !== undefined) { fields.push('time_limit_seconds = ?'); values.push(data.time_limit_seconds); }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(data.sort_order); }

    if (fields.length === 0) {
      return { success: false, message: 'Нет данных для обновления' };
    }

    values.push(id);

    try {
      await this.db.execute(`UPDATE missions SET ${fields.join(', ')} WHERE id = ?`, values);
      return { success: true, message: 'Задание обновлено!' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Удалить задание
   */
  async deleteMission(id: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.db.execute('DELETE FROM missions WHERE id = ?', [id]);
      return { success: true, message: 'Задание удалено!' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Получить все ранги
   */
  async getAllRanks(): Promise<PilotRank[]> {
    const [rows] = await this.db.execute('SELECT * FROM pilot_ranks ORDER BY sort_order ASC') as any;
    return rows;
  }

  /**
   * Получить статистику по заданиям
   */
  async getMissionStats(): Promise<any> {
    const [totalMissions] = await this.db.execute('SELECT COUNT(*) as count FROM missions') as any;
    const [activeMissions] = await this.db.execute('SELECT COUNT(*) as count FROM missions WHERE is_active = 1') as any;
    const [completedMissions] = await this.db.execute('SELECT COUNT(*) as count FROM pilot_mission_progress WHERE status = "completed"') as any;
    const [totalPlayers] = await this.db.execute('SELECT COUNT(DISTINCT player_id) as count FROM pilot_mission_progress') as any;

    return {
      totalMissions: totalMissions[0].count,
      activeMissions: activeMissions[0].count,
      totalCompletions: completedMissions[0].count,
      playersWithProgress: totalPlayers[0].count,
    };
  }

  // ============================================================
  // ВНУТРЕННИЕ МЕТОДЫ
  // ============================================================

  private async getPlayerMissionProgress(playerId: string, missionId: string): Promise<PilotMissionProgress | null> {
    const [rows] = await this.db.execute(
      'SELECT * FROM pilot_mission_progress WHERE player_id = ? AND mission_id = ?',
      [playerId, missionId]
    ) as any;

    if (rows.length === 0) return null;

    let prog = rows[0].progress;
    if (typeof prog === 'string') {
      try { prog = JSON.parse(prog); } catch (e) { prog = null; }
    } else if (typeof prog !== 'object') {
      prog = null;
    }

    return {
      ...rows[0],
      progress: prog,
    };
  }

  private async updateMissionProgress(playerId: string, missionId: string, progressData: any): Promise<void> {
    await this.db.execute(
      `UPDATE pilot_mission_progress 
       SET progress = ?, last_attempt_at = NOW()
       WHERE player_id = ? AND mission_id = ?`,
      [JSON.stringify(progressData), playerId, missionId]
    );
  }

  private parseMission(row: any): Mission {
    // mysql2 автоматически парсит JSON поля
    let options = null;
    if (Array.isArray(row.options)) {
      options = row.options;
    } else if (typeof row.options === 'string' && row.options.trim()) {
      try {
        options = JSON.parse(row.options);
      } catch (e) {
        // Fallback: строка без JSON
        if (row.options.startsWith('[')) {
          options = row.options.replace(/\\"/g, '"').replace(/^\["|"\]$/g, '').split('","');
        }
      }
    }

    let target_coords = null;
    if (row.target_coordinates && typeof row.target_coordinates === 'object') {
      target_coords = row.target_coordinates;
    } else if (typeof row.target_coordinates === 'string' && row.target_coordinates.trim()) {
      try {
        target_coords = JSON.parse(row.target_coordinates);
      } catch (e) {
        target_coords = null;
      }
    }

    return {
      ...row,
      options,
      target_coordinates: target_coords,
      is_active: !!row.is_active,
      is_repeatable: !!row.is_repeatable,
    };
  }

  private errorResult(message: string): MissionCompleteResult {
    return {
      success: false,
      message,
      reward: null,
      newRank: null,
      progress: null,
    };
  }

  private generateId(): string {
    return require('crypto').randomUUID();
  }

  private getPilotDirectory(playerId: string): string {
    return path.join(this.playerDataPath, playerId);
  }
}
