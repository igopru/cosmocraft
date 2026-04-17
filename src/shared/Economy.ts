// src/server/services/Economy.ts
/**
 * Экономика CosmoCraft
 * Все цены, коэффициенты и константы — в одном месте
 */

export interface EconomyPrices {
  // Покупка (игрок покупает у станции)
  buyMetal: number;
  buySilicon: number;
  buyIce: number;
  buyRare: number;
  buyFuel: number;
  buyWater: number;

  // Продажа (игрок продаёт станции)
  sellMetal: number;
  sellSilicon: number;
  sellIce: number;
  sellRare: number;
  sellFuel: number;

  // Услуги
  healRadiation: number;    // за 1% радиации
  healShield: number;       // за 1% щитов
  refillWater: number;      // за 1 единицу воды
  refillEnergy: number;     // за 1 единицу энергии

  // Валюта
  currency: string;
  currencySymbol: string;
}

export interface EconomyConfig {
  prices: EconomyPrices;
  // Множитель цен при торговле большими партиями
  bulkDiscountThreshold: number;  // от скольки единиц начинается скидка
  bulkDiscountPercent: number;    // процент скидки
  // Комиссия станции (процент от сделки идёт станции)
  stationCommission: number;
  // Стартовые кредиты нового пилота
  startingCredits: number;
}

/**
 * Базовая конфигурация экономики
 * Цены указаны в кредитах (Cred) за единицу ресурса
 */
export const ECONOMY: EconomyConfig = {
  prices: {
    // Покупка ресурсов у станции
    buyMetal: 2,       // 2 Cred за металл
    buySilicon: 5,     // 5 Cred за кремний
    buyIce: 3,         // 3 Cred за лёд
    buyRare: 25,       // 25 Cred за редкие
    buyFuel: 4,        // 4 Cred за топливо
    buyWater: 1,       // 1 Cred за воду

    // Продажа ресурсов станции
    sellMetal: 1,      // 1 Cred (50% от покупки)
    sellSilicon: 2.5,  // 2.5 Cred
    sellIce: 1.5,      // 1.5 Cred
    sellRare: 12,      // 12 Cred
    sellFuel: 2,       // 2 Cred

    // Услуги
    healRadiation: 0.5,   // 0.5 Cred за 1% радиации
    healShield: 0.3,      // 0.3 Cred за 1% щитов
    refillWater: 0.5,     // 0.5 Cred за 1 воду
    refillEnergy: 0.2,    // 0.2 Cred за 1 энергию

    currency: 'Cred',
    currencySymbol: '₡',
  },

  // Скидка за опт
  bulkDiscountThreshold: 100,  // от 100 единиц
  bulkDiscountPercent: 10,     // 10% скидка

  // Комиссия станции (идёт в "банк" станции)
  stationCommission: 0.05,  // 5%

  // Стартовые кредиты
  startingCredits: 500,
};

/**
 * Рассчитать стоимость покупки ресурса с учётом оптовой скидки
 */
export function calcBuyCost(resource: keyof Omit<EconomyPrices, 'currency' | 'currencySymbol'>,
                            amount: number, config: EconomyConfig = ECONOMY): { total: number; discount: number; perUnit: number } {
  const basePrice = config.prices[resource];
  let perUnit = basePrice;
  let discount = 0;

  if (amount >= config.bulkDiscountThreshold) {
    discount = config.bulkDiscountPercent / 100;
    perUnit = basePrice * (1 - discount);
  }

  return {
    total: Math.round(perUnit * amount * 100) / 100,
    discount: Math.round(discount * 100),
    perUnit: Math.round(perUnit * 100) / 100,
  };
}

/**
 * Рассчитать стоимость продажи ресурса
 */
export function calcSellPrice(resource: 'Metal' | 'Silicon' | 'Ice' | 'Rare' | 'Fuel',
                               amount: number, config: EconomyConfig = ECONOMY): number {
  const sellKey = `sell${resource}` as keyof EconomyPrices;
  const basePrice = (config.prices[sellKey] as number) || 0;
  return Math.round(basePrice * amount * 100) / 100;
}

/**
 * Рассчитать стоимость услуги
 */
export function calcServiceCost(service: 'healRadiation' | 'healShield' | 'refillWater' | 'refillEnergy',
                                 amount: number, config: EconomyConfig = ECONOMY): number {
  const price = config.prices[service];
  return Math.round(price * amount * 100) / 100;
}

/**
 * Проверить хватает ли кредитов
 */
export function canAfford(cost: number, balance: number): boolean {
  return balance >= cost;
}

/**
 * Получить все цены в читаемом виде
 */
export function getPriceList(config: EconomyConfig = ECONOMY): string[] {
  const p = config.prices;
  return [
    `📊 Прайс-лист базовой станции (${p.currency})`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🔩 Металл:    купить ${p.buyMetal}₡  |  продать ${p.sellMetal}₡`,
    `💎 Кремний:   купить ${p.buySilicon}₡  |  продать ${p.sellSilicon}₡`,
    `❄️ Лёд:       купить ${p.buyIce}₡  |  продать ${p.sellIce}₡`,
    `✨ Редкие:    купить ${p.buyRare}₡  |  продать ${p.sellRare}₡`,
    `⛽ Топливо:   купить ${p.buyFuel}₡  |  продать ${p.sellFuel}₡`,
    `💧 Вода:      купить ${p.buyWater}₡`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `☢️ Лечение радиации: ${p.healRadiation}₡/%`,
    `🛡️ Восстановление щитов: ${p.healShield}₡/%`,
    `💧 Вода: ${p.refillWater}₡/ед`,
    `⚡ Энергия: ${p.refillEnergy}₡/ед`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📦 Оптовая скидка: от ${config.bulkDiscountThreshold} ед → -${config.bulkDiscountPercent}%`,
  ];
}
