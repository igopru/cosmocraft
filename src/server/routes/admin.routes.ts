// src/server/routes/admin.routes.ts
import { Router, Request, Response } from 'express';
import { AdminService } from '../services/AdminService';
import { DatabaseManager } from '../storage/DatabaseManager';

const router = Router();

let adminService: AdminService;
let db: DatabaseManager;
let jwtSecret: string;

/**
 * Инициализация маршрутов
 */
export function initAdminRoutes(database: DatabaseManager, secret: string) {
  db = database;
  jwtSecret = secret;
  adminService = new AdminService(db, jwtSecret);
  return router;
}

/**
 * Middleware для проверки токена администратора
 */
async function requireAdmin(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const token = authHeader.substring(7);
  const admin = await adminService.verifyAdminToken(token);

  if (!admin) {
    return res.status(401).json({ error: 'Неверный токен или истёк срок действия' });
  }

  (req as any).admin = admin;
  (req as any).token = token;
  next();
}

/**
 * Безопасный parseInt
 */
function safeInt(value: any, def: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : def;
}

/**
 * Публичные маршруты
 */

// Вход администратора
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const ipAddress = req.ip || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    if (!username || !password) {
      return res.status(400).json({ error: 'Требуется имя пользователя и пароль' });
    }

    const result = await adminService.adminLogin(username, password, ipAddress, userAgent);

    if (result.success) {
      res.json({
        success: true,
        token: result.token,
        message: 'Вход выполнен успешно'
      });
    } else {
      res.status(401).json({ error: result.error });
    }
  } catch (error: any) {
    console.error('Ошибка входа администратора:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Защищённые маршруты
 */

// Информация о текущем администраторе
router.get('/me', requireAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin;
  res.json({
    id: admin.id,
    username: admin.username,
    email: admin.email,
    role: admin.role,
    permissions: admin.permissions
  });
});

// Выход
router.post('/logout', requireAdmin, async (req: Request, res: Response) => {
  const token = (req as any).token;
  const admin = (req as any).admin;

  await adminService.adminLogout(token, admin.id);
  res.json({ success: true });
});

// Статистика сервера
router.get('/stats', requireAdmin, async (req: Request, res: Response) => {
  const stats = await adminService.getServerStats();
  res.json(stats);
});

// Активные игроки
router.get('/players/active', requireAdmin, async (req: Request, res: Response) => {
  const players = await adminService.getActivePlayers();
  res.json(players);
});

// Все игроки
router.get('/players', requireAdmin, async (req: Request, res: Response) => {
  const players = await adminService.getAllPlayers(100, 0);
  res.json(players);
});

// Получить игрока по ID
router.get('/players/:id', requireAdmin, async (req: Request, res: Response) => {
  const playerId = req.params.id as string;
  const player = await adminService.getPlayerById(playerId);

  if (!player) {
    return res.status(404).json({ error: 'Игрок не найден' });
  }

  res.json(player);
});

// Бан игрока
router.post('/players/:id/ban', requireAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin;
  const playerId = req.params.id as string;
  const { reason, durationMinutes } = req.body;

  const result = await adminService.banPlayer(playerId, admin.id, reason, durationMinutes);

  if (result.success) {
    res.json({ success: true, message: 'Игрок заблокирован' });
  } else {
    res.status(400).json({ error: result.error });
  }
});

// Разбан игрока
router.post('/players/:id/unban', requireAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin;
  const playerId = req.params.id as string;
  const result = await adminService.unbanPlayer(playerId, admin.id);

  if (result.success) {
    res.json({ success: true, message: 'Игрок разблокирован' });
  } else {
    res.status(400).json({ error: 'Ошибка разблокировки' });
  }
});

// Удаление игрока
router.delete('/players/:id', requireAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin;
  const playerId = req.params.id as string;
  const result = await adminService.deletePlayer(playerId, admin.id);

  if (result.success) {
    res.json({ success: true, message: 'Игрок удалён' });
  } else {
    res.status(400).json({ error: result.error });
  }
});

// Настройки сервера
router.get('/settings', requireAdmin, async (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  const settings = await adminService.getServerSettings(category, false);
  res.json(settings);
});

// Обновление настройки
router.put('/settings/:id', requireAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin;
  const settingId = req.params.id as string;
  const { value } = req.body;

  if (value === undefined) {
    return res.status(400).json({ error: 'Требуется значение' });
  }

  const result = await adminService.updateServerSetting(settingId, value, admin.id);

  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: result.error });
  }
});

// Журнал действий
router.get('/logs', requireAdmin, async (req: Request, res: Response) => {
  const logs = await adminService.getAdminActionsLog(100);
  res.json(logs);
});

// Подозрительная активность
router.get('/security/suspicious', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [rows] = await db.execute(`SELECT * FROM admin_suspicious_activity ORDER BY failed_attempts DESC`);
    res.json(rows as any[]);
  } catch (error: any) {
    console.error('Ошибка получения подозрительной активности:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// 2FA для игрока
router.post('/players/:id/2fa', requireAdmin, async (req: Request, res: Response) => {
  const playerId = req.params.id as string;
  const { enabled } = req.body;
  const result = await adminService.togglePlayer2FA(playerId, enabled);

  if (result.success) {
    res.json({
      success: true,
      secret: result.secret,
      qrCode: result.qrCode
    });
  } else {
    res.status(400).json({ error: 'Ошибка 2FA' });
  }
});

// Проверка 2FA кода
router.post('/verify-2fa', requireAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin;
  const { code } = req.body;

  const isValid = await adminService.verify2FACode(admin.id, code);

  if (isValid) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Неверный код' });
  }
});

// Создать администратора (только super_admin)
router.post('/admins', requireAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin;

  if (admin.role !== 'super_admin') {
    return res.status(403).json({ error: 'Только super_admin может создавать администраторов' });
  }

  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Требуется имя, email и пароль' });
  }

  const result = await adminService.createAdmin(
    username,
    email,
    password,
    role || 'moderator',
    admin.id
  );

  if (result.success) {
    res.json({ success: true, message: 'Администратор создан' });
  } else {
    res.status(400).json({ error: result.error });
  }
});

// ============================================================
// МАРШРУТЫ БЕЗОПАСНОСТИ
// ============================================================

// Статистика безопасности
router.get('/security/stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [rows] = await db.execute(`SELECT * FROM admin_security_stats`);
    res.json((rows as any[])[0] || {});
  } catch (error: any) {
    console.error('Ошибка получения статистики безопасности:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Подозрительная активность
router.get('/security/suspicious', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [rows] = await db.execute(`SELECT * FROM admin_suspicious_activity ORDER BY failed_attempts DESC`);
    res.json(rows as any[]);
  } catch (error: any) {
    console.error('Ошибка получения подозрительной активности:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Журнал запросов на порты
router.get('/security/port-access', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [rows] = await db.execute(
      `SELECT * FROM port_access_log
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json(rows as any[]);
  } catch (error: any) {
    console.error('Ошибка получения журнала портов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Топ IP по ошибкам
router.get('/security/top-ips', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [rows] = await db.execute(
      `SELECT ip_address, COUNT(*) as error_count,
              SUM(CASE WHEN status_code = 401 THEN 1 ELSE 0 END) as unauthorized_count,
              SUM(CASE WHEN status_code = 403 THEN 1 ELSE 0 END) as forbidden_count,
              SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_error_count,
              MAX(created_at) as last_seen
       FROM port_access_log
       WHERE status_code >= 400 AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       GROUP BY ip_address
       ORDER BY error_count DESC
       LIMIT 50`
    );
    res.json(rows as any[]);
  } catch (error: any) {
    console.error('Ошибка получения топ IP:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ============================================================
// МАРШРУТЫ ЖУРНАЛА АУДИТА
// ============================================================

// Полный журнал действий администраторов
router.get('/audit/actions', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [rows] = await db.execute(
      `SELECT al.*, au.username as admin_username
       FROM admin_actions_log al
       LEFT JOIN admin_users au ON al.admin_id = au.id
       ORDER BY al.created_at DESC
       LIMIT 200`
    );
    res.json(rows as any[]);
  } catch (error: any) {
    console.error('Ошибка получения журнала:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Журнал аудита изменений
router.get('/audit/changes', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [rows] = await db.execute(
      `SELECT al.*, au.username as admin_username
       FROM admin_audit_log al
       LEFT JOIN admin_users au ON al.admin_id = au.id
       ORDER BY al.created_at DESC
       LIMIT 100`
    );
    res.json(rows as any[]);
  } catch (error: any) {
    console.error('Ошибка получения журнала изменений:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ============================================================
// МАРШРУТЫ УПРАВЛЕНИЯ ЗАДАНИЯМИ (МИССИЯМИ)
// ============================================================

// Получить статистику заданий
router.get('/missions/stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { MissionService } = require('../services/MissionService');
    const mService = new MissionService(db);
    const stats = await mService.getMissionStats();
    res.json({ success: true, stats });
  } catch (error: any) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить все задания
router.get('/missions', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { MissionService } = require('../services/MissionService');
    const mService = new MissionService(db);
    const { category, difficulty } = req.query;
    const missions = await mService.getAllMissions(
      category as any,
      difficulty as any
    );
    res.json({ success: true, missions });
  } catch (error: any) {
    console.error('Ошибка получения заданий:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить одно задание
router.get('/missions/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { MissionService } = require('../services/MissionService');
    const mService = new MissionService(db);
    const mission = await mService.getMissionById(req.params.id);
    if (!mission) {
      return res.status(404).json({ error: 'Задание не найдено' });
    }
    res.json({ success: true, mission });
  } catch (error: any) {
    console.error('Ошибка получения задания:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Создать задание
router.post('/missions', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { MissionService } = require('../services/MissionService');
    const mService = new MissionService(db);
    const result = await mService.createMission(req.body);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error: any) {
    console.error('Ошибка создания задания:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Обновить задание
router.put('/missions/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { MissionService } = require('../services/MissionService');
    const mService = new MissionService(db);
    const result = await mService.updateMission(req.params.id, req.body);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error: any) {
    console.error('Ошибка обновления задания:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Удалить задание
router.delete('/missions/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { MissionService } = require('../services/MissionService');
    const mService = new MissionService(db);
    const result = await mService.deleteMission(req.params.id);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error: any) {
    console.error('Ошибка удаления задания:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Получить все ранги
router.get('/missions/ranks', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { MissionService } = require('../services/MissionService');
    const mService = new MissionService(db);
    const ranks = await mService.getAllRanks();
    res.json({ success: true, ranks });
  } catch (error: any) {
    console.error('Ошибка получения рангов:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

export default router;
