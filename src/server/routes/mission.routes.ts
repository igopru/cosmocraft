// src/server/routes/mission.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { MissionService } from '../services/MissionService';
import { DatabaseManager } from '../storage/DatabaseManager';
import * as crypto from 'crypto';

const router = Router();

let missionService: MissionService;
let db: DatabaseManager;

/**
 * Обфускация имени (копия из PlayerManager для поиска playerId)
 */
function obfuscateName(name: string): string {
  const secret = process.env.OBFUSCATION_SECRET || 'cosmocraft_default_secret_2026';
  return crypto.createHmac('sha256', secret)
    .update(name.toLowerCase().trim())
    .digest('hex')
    .substring(0, 16);
}

/**
 * Middleware для идентификации пилота
 * Ищет реальный UUID игрока в БД по имени
 */
async function requirePilot(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Прямой playerId (UUID)
    const playerIdHeader = req.headers['x-player-id'] as string;
    if (playerIdHeader) {
      (req as any).playerId = playerIdHeader;
      return next();
    }

    // 2. playerName — ищем UUID в БД
    const playerName = req.headers['x-player-name'] as string;
    if (playerName) {
      // Сначала пробуем прямое совпадение по username
      const [rows] = await db.execute(
        'SELECT id FROM players WHERE username = ? LIMIT 1',
        [playerName]
      ) as any;

      if (rows.length > 0) {
        (req as any).playerId = rows[0].id;
        (req as any).playerName = playerName;
        return next();
      }

      // Если не нашли — пробуем через обфусцированное имя
      // (обфусцированное имя хранится как playerId в player_manager, но не в БД)
      // Создаём запись если не существует
      const obfuscated = obfuscateName(playerName);
      const [newRows] = await db.execute(
        'SELECT id FROM players WHERE id = ?',
        [obfuscated]
      ) as any;

      if (newRows.length > 0) {
        (req as any).playerId = newRows[0].id;
      } else {
        // Создаём временного игрока с UUID = обфусцированное имя
        await db.execute(
          'INSERT IGNORE INTO players (id, username) VALUES (?, ?)',
          [obfuscated, playerName]
        );
        (req as any).playerId = obfuscated;
      }
      (req as any).playerName = playerName;
      return next();
    }

    // 3. playerId в query
    const queryPlayerId = req.query.playerId as string;
    if (queryPlayerId) {
      (req as any).playerId = queryPlayerId;
      return next();
    }

    // 4. playerName в query
    const queryPlayerName = req.query.playerName as string;
    if (queryPlayerName) {
      const [rows] = await db.execute(
        'SELECT id FROM players WHERE username = ? LIMIT 1',
        [queryPlayerName]
      ) as any;

      if (rows.length > 0) {
        (req as any).playerId = rows[0].id;
      } else {
        const obfuscated = obfuscateName(queryPlayerName);
        await db.execute(
          'INSERT IGNORE INTO players (id, username) VALUES (?, ?)',
          [obfuscated, queryPlayerName]
        );
        (req as any).playerId = obfuscated;
      }
      (req as any).playerName = queryPlayerName;
      return next();
    }

    return res.status(401).json({ error: 'Требуется X-Player-ID или X-Player-Name header' });
  } catch (error: any) {
    console.error('Ошибка идентификации пилота:', error);
    return res.status(500).json({ error: 'Ошибка сервера при идентификации' });
  }
}

/**
 * Инициализация маршрутов для заданий
 */
export function initMissionRoutes(database: DatabaseManager): Router {
  db = database;
  missionService = new MissionService(db);
  return router;
}

// ============================================================
// МАРШРУТЫ (требуется аутентификация пилота)
// ============================================================

// Применяем middleware ко всем маршрутам
router.use(requirePilot);

/**
 * Получить все задания с прогрессом пилота
 * GET /api/missions
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const playerId = (req as any).playerId;
    if (!playerId) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const missions = await missionService.getPlayerMissions(playerId);
    res.json({ success: true, missions });
  } catch (error: any) {
    console.error('Ошибка получения заданий:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить одно задание по ID
 * GET /api/missions/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const mission = await missionService.getMissionById(req.params.id as string);
    if (!mission) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }
    res.json({ success: true, mission });
  } catch (error: any) {
    console.error('Ошибка получения задания:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Начать задание
 * POST /api/missions/:id/start
 */
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const playerId = (req as any).playerId;
    if (!playerId) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const result = await missionService.startMission(playerId, req.params.id as string);
    res.json(result);
  } catch (error: any) {
    console.error('Ошибка начала задания:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Отправить ответ на викторину
 * POST /api/missions/:id/answer
 */
router.post('/:id/answer', async (req: Request, res: Response) => {
  try {
    const playerId = (req as any).playerId;
    if (!playerId) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { answer } = req.body;
    if (answer === undefined || answer === null) {
      return res.status(400).json({ error: 'Требуется параметр "answer"' });
    }

    const result = await missionService.submitQuizAnswer(playerId, req.params.id as string, answer);
    res.json(result);
  } catch (error: any) {
    console.error('Ошибка отправки ответа:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Обновить прогресс по заданию на полёт/поиск
 * POST /api/missions/:id/progress
 */
router.post('/:id/progress', async (req: Request, res: Response) => {
  try {
    const playerId = (req as any).playerId;
    if (!playerId) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { location, objects_found } = req.body;
    const result = await missionService.updateFlightProgress(playerId, req.params.id as string, {
      location,
      objects_found,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Ошибка обновления прогресса:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Проверить близость к цели задания
 * GET /api/missions/:id/check-proximity?x=..&y=..&z=..
 */
router.get('/:id/check-proximity', async (req: Request, res: Response) => {
  try {
    const playerId = (req as any).playerId;
    if (!playerId) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const x = parseFloat(req.query.x as string);
    const y = parseFloat(req.query.y as string);
    const z = parseFloat(req.query.z as string);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      return res.status(400).json({ error: 'Требуются параметры x, y, z' });
    }

    const result = await missionService.checkProximityToTarget(playerId, req.params.id as string, x, y, z);
    res.json({
      success: true,
      inZone: result.inZone,
      distance: Math.round(result.distance),
      mission: result.mission ? {
        id: result.mission.id,
        title: result.mission.title,
        type: result.mission.type,
      } : null,
    });
  } catch (error: any) {
    console.error('Ошибка проверки близости:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить ранг и статистику пилота
 * GET /api/missions/rank
 */
router.get('/rank/status', async (req: Request, res: Response) => {
  try {
    const playerId = (req as any).playerId;
    if (!playerId) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const [rows] = await db.execute(
      `SELECT pr.total_xp, pr.missions_completed, pr.last_rank_up_at,
              r.title as rank_title, r.icon as rank_icon, r.color as rank_color, r.description as rank_description
       FROM pilot_rank_progress pr
       LEFT JOIN pilot_ranks r ON pr.current_rank_id = r.id
       WHERE pr.player_id = ?`,
      [playerId]
    ) as any;

    if (rows.length === 0) {
      res.json({
        success: true,
        rank: {
          title: 'Новичок',
          icon: '🚀',
          color: '#9e9e9e',
          description: 'Только начал свой путь в космосе',
        },
        total_xp: 0,
        missions_completed: 0,
      });
    } else {
      res.json({
        success: true,
        rank: {
          title: rows[0].rank_title || 'Новичок',
          icon: rows[0].rank_icon || '🚀',
          color: rows[0].rank_color || '#9e9e9e',
          description: rows[0].rank_description || '',
        },
        total_xp: rows[0].total_xp,
        missions_completed: rows[0].missions_completed,
        last_rank_up_at: rows[0].last_rank_up_at,
      });
    }
  } catch (error: any) {
    console.error('Ошибка получения ранга:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить все ранги
 * GET /api/missions/ranks
 */
router.get('/ranks/list', async (req: Request, res: Response) => {
  try {
    const ranks = await missionService.getAllRanks();
    res.json({ success: true, ranks });
  } catch (error: any) {
    console.error('Ошибка получения рангов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
