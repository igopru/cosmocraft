// src/server/services/StationTradeService.ts
/**
 * Сервис торговли на базовой станции
 * Обработка продаж, покупок, услуг, управление кредитами
 */
import { DatabaseManager } from '../storage/DatabaseManager';
import { ECONOMY, calcBuyCost, calcSellPrice, calcServiceCost, canAfford } from '../../shared/Economy';
import { logSell, logBuy, logService, logError, logBalanceLoad } from '../utils/TradeLogger';

export interface TradeResult {
  success: boolean;
  message: string;
  balanceAfter: number;
  transactionId?: string;
}

export interface PlayerCargo {
  metal: number;
  silicon: number;
  ice: number;
  rare: number;
  fuel: number;
  water: number;
}

export type SellResource = 'metal' | 'silicon' | 'ice' | 'rare' | 'fuel';
export type BuyResource = 'metal' | 'silicon' | 'ice' | 'rare' | 'fuel' | 'water';
export type ServiceType = 'healRadiation' | 'healShield' | 'refillEnergy' | 'refillWater';

export class StationTradeService {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  /** Найти player_id (для pilot_credits) по username */
  private async resolvePlayerId(username: string): Promise<string> {
    try {
      const [rows] = await this.db.execute(
        'SELECT id FROM players WHERE username = ? LIMIT 1',
        [username]
      ) as any;
      if (rows && rows.length > 0) {
        return `player_${rows[0].id}`;
      }
    } catch (e) {
      console.error('⚠️ resolvePlayerId error:', e);
    }
    return `player_${username}`;
  }

  /** Получить или создать баланс пилота */
  async getBalance(playerName: string): Promise<number> {
    const playerId = await this.resolvePlayerId(playerName);

    try {
      const [rows] = await this.db.execute(
        'SELECT balance FROM pilot_credits WHERE player_id = ? LIMIT 1',
        [playerId]
      ) as any;

      if (!rows || rows.length === 0) {
        await this.db.execute(
          'INSERT INTO pilot_credits (player_id, balance) VALUES (?, ?)',
          [playerId, ECONOMY.startingCredits]
        );
        logBalanceLoad(playerName, ECONOMY.startingCredits, 'db_insert');
        return ECONOMY.startingCredits;
      }
      const bal = parseFloat(rows[0].balance);
      logBalanceLoad(playerName, bal, 'db_select');
      return bal;
    } catch (e) {
      console.error('⚠️ getBalance error:', e);
      return ECONOMY.startingCredits;
    }
  }

  /** Продать ресурсы станции */
  async sellResource(
    playerName: string,
    resource: SellResource,
    amount: number,
    _clientCargo?: PlayerCargo
  ): Promise<TradeResult> {
    const playerId = await this.resolvePlayerId(playerName);
    const balance = await this.getBalance(playerName);

    // Проверяем реальный cargo из БД (НЕ верим клиенту)
    const dbCargo = await this.getPlayerCargo(playerName);
    const available = (dbCargo as any)[resource] || 0;

    if (amount <= 0) {
      return { success: false, message: 'Количество должно быть больше 0', balanceAfter: balance };
    }

    if (amount > available) {
      return {
        success: false,
        message: `Недостаточно ресурса. Есть: ${available}, нужно: ${amount}`,
        balanceAfter: balance,
      };
    }

    const sellKey = `sell${resource.charAt(0).toUpperCase() + resource.slice(1)}` as keyof typeof ECONOMY.prices;
    const pricePerUnit = ECONOMY.prices[sellKey] as number;
    const total = Math.round(pricePerUnit * amount * 100) / 100;

    const commission = total * ECONOMY.stationCommission;
    const payout = total - commission;
    const newBalance = balance + payout;

    await this.db.execute(
      'UPDATE pilot_credits SET balance = ?, total_earned = total_earned + ? WHERE player_id = ?',
      [newBalance, payout, playerId]
    );

    await this.updatePlayerCargo(playerName, resource, -amount);

    const txId = crypto.randomUUID();
    await this.db.execute(
      `INSERT INTO station_transactions
       (id, player_id, type, resource, amount, price_per_unit, total, balance_after)
       VALUES (?, ?, 'sell', ?, ?, ?, ?, ?)`,
      [txId, playerId, resource, amount, pricePerUnit, payout, newBalance]
    );

    logSell(playerName, resource, amount, payout, newBalance);

    return {
      success: true,
      message: `Продано ${amount} ${resource} за ${payout.toFixed(1)} Cred`,
      balanceAfter: newBalance,
      transactionId: txId,
    };
  }

  /** Купить ресурсы у станции */
  async buyResource(
    playerName: string,
    resource: BuyResource,
    amount: number,
    clientCargo?: PlayerCargo
  ): Promise<TradeResult> {
    const playerId = await this.resolvePlayerId(playerName);
    const balance = await this.getBalance(playerName);

    if (amount <= 0) {
      return { success: false, message: 'Количество должно быть больше 0', balanceAfter: balance };
    }

    const buyKey = `buy${resource.charAt(0).toUpperCase() + resource.slice(1)}` as keyof typeof ECONOMY.prices;
    const basePrice = ECONOMY.prices[buyKey] as number;
    let perUnit = basePrice;
    let discount = 0;

    if (amount >= ECONOMY.bulkDiscountThreshold) {
      discount = ECONOMY.bulkDiscountPercent;
      perUnit = basePrice * (1 - discount / 100);
    }

    const total = Math.round(perUnit * amount * 100) / 100;

    if (!canAfford(total, balance)) {
      return {
        success: false,
        message: `Недостаточно кредитов. Нужно: ${total.toFixed(1)}, есть: ${balance.toFixed(1)}`,
        balanceAfter: balance,
      };
    }

    const newBalance = balance - total;

    await this.db.execute(
      'UPDATE pilot_credits SET balance = ?, total_spent = total_spent + ? WHERE player_id = ?',
      [newBalance, total, playerId]
    );

    await this.updatePlayerCargo(playerName, resource, amount);

    const txId = crypto.randomUUID();
    await this.db.execute(
      `INSERT INTO station_transactions
       (id, player_id, type, resource, amount, price_per_unit, discount_percent, total, balance_after)
       VALUES (?, ?, 'buy', ?, ?, ?, ?, ?, ?)`,
      [txId, playerId, resource, amount, perUnit, discount, total, newBalance]
    );

    logBuy(playerName, resource, amount, total, newBalance, discount > 0 ? discount : undefined);

    return {
      success: true,
      message: `Куплено ${amount} ${resource} за ${total.toFixed(1)} Cred${discount > 0 ? ` (скидка ${discount}%)` : ''}`,
      balanceAfter: newBalance,
      transactionId: txId,
    };
  }

  /** Получить услугу (лечение, заправка) */
  async getService(
    playerName: string,
    service: ServiceType,
    amount: number
  ): Promise<TradeResult> {
    const playerId = await this.resolvePlayerId(playerName);
    const balance = await this.getBalance(playerName);

    if (amount <= 0) {
      return { success: false, message: 'Количество должно быть больше 0', balanceAfter: balance };
    }

    const cost = calcServiceCost(service, amount);

    if (!canAfford(cost, balance)) {
      return {
        success: false,
        message: `Недостаточно кредитов. Нужно: ${cost.toFixed(1)}, есть: ${balance.toFixed(1)}`,
        balanceAfter: balance,
      };
    }

    const newBalance = balance - cost;

    await this.db.execute(
      'UPDATE pilot_credits SET balance = ?, total_spent = total_spent + ? WHERE player_id = ?',
      [newBalance, cost, playerId]
    );

    const txId = crypto.randomUUID();
    await this.db.execute(
      `INSERT INTO station_transactions
       (id, player_id, type, resource, amount, price_per_unit, total, balance_after)
       VALUES (?, ?, 'service', ?, ?, ?, ?, ?)`,
      [txId, playerId, service, amount, ECONOMY.prices[service], cost, newBalance]
    );

    logService(playerName, service, amount, cost, newBalance);

    const labels: Record<ServiceType, string> = {
      healRadiation: 'Лечение радиации',
      healShield: 'Восстановление щитов',
      refillEnergy: 'Зарядка энергии',
      refillWater: 'Заправка воды',
    };

    return {
      success: true,
      message: `${labels[service]}: ${amount} ед. за ${cost.toFixed(1)} Cred`,
      balanceAfter: newBalance,
      transactionId: txId,
    };
  }

  /** Получить груз пилота (по username) */
  private async getPlayerCargo(username: string): Promise<PlayerCargo> {
    const [rows] = await this.db.execute(
      'SELECT cargo_json FROM players WHERE username = ? LIMIT 1',
      [username]
    ) as any;

    if (!rows || rows.length === 0 || !rows[0].cargo_json) {
      return { metal: 0, silicon: 0, ice: 0, rare: 0, fuel: 0, water: 0 };
    }
    try {
      return typeof rows[0].cargo_json === "string" ? JSON.parse(rows[0].cargo_json) : rows[0].cargo_json;
    } catch {
      return { metal: 0, silicon: 0, ice: 0, rare: 0, fuel: 0, water: 0 };
    }
  }

  /** Обновить ресурс в cargo игрока (по username) */
  private async updatePlayerCargo(
    username: string,
    resource: string,
    delta: number
  ): Promise<void> {
    const cargo = await this.getPlayerCargo(username);
    (cargo as any)[resource] = Math.max(0, ((cargo as any)[resource] || 0) + delta);

    await this.db.execute(
      'UPDATE players SET cargo_json = ? WHERE username = ?',
      [JSON.stringify(cargo), username]
    );
  }
}
