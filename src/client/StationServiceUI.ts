// src/client/StationServiceUI.ts
/**
 * Интерфейс обслуживания на базовой станции
 * Вызывается по клавише V рядом со станцией
 */
import { ECONOMY, calcBuyCost, calcSellPrice, calcServiceCost, getPriceList } from '../shared/Economy.js';

export class StationServiceUI {
  private container: HTMLElement | null = null;
  private credits: number = 0;
  private playerId: string = '';
  private playerResources: { metal: number; silicon: number; ice: number; rare: number; fuel: number; water: number } = {
    metal: 0, silicon: 0, ice: 0, rare: 0, fuel: 0, water: 0
  };
  private playerStats: { shields: number; radiation: number; energy: number; energyCapacity: number; waterCapacity: number } = {
    shields: 100, radiation: 0, energy: 500, energyCapacity: 1000, waterCapacity: 100
  };
  private activeTab: string = 'sell';
  private onTradeComplete: ((updatedCargo: any) => void) | null = null;

  constructor() {}

  /** Установить callback после торговли */
  setOnTradeComplete(cb: (updatedCargo: any) => void) { this.onTradeComplete = cb; }

  /** Показать интерфейс станции */
  async show(playerId: string, credits: number, resources: any, stats: any) {
    if (this.container) this.hide();

    this.playerId = playerId;
    this.credits = credits;
    this.playerStats = { ...this.playerStats, ...stats };

    // Загружаем cargo С СЕРВЕРА (единственный источник правды)
    try {
      const cargoResp = await fetch(`/api/station/cargo`, {
        headers: { 'X-Player-Name': this.playerId },
      });
      const cargoData = await cargoResp.json();
      if (cargoData.cargo) {
        this.playerResources = cargoData.cargo;
      } else {
        this.playerResources = { metal: 0, silicon: 0, ice: 0, rare: 0, fuel: 0, water: 0 };
      }
    } catch (e) {
      console.warn('⚠️ Не удалось загрузить cargo с сервера');
      this.playerResources = { metal: 0, silicon: 0, ice: 0, rare: 0, fuel: 0, water: 0 };
    }

    // 2. Загружаем актуальный баланс с сервера
    try {
      const resp = await fetch(`/api/station/balance`, {
        headers: { 'X-Player-Name': this.playerId },
      });
      const data = await resp.json();
      if (data.balance !== undefined && data.balance !== null) {
        this.credits = parseFloat(data.balance);
      }
    } catch (e: any) {
      console.error(`🏪 [BALANCE] FETCH ERROR:`, e.message);
    }

    this.container = document.createElement('div');
    this.container.id = 'station-service-ui';
    this.container.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.85); z-index: 10003;
      display: flex; justify-content: center; align-items: center;
    `;

    this.container.innerHTML = `
      <div style="
        background: linear-gradient(135deg, rgba(0,15,30,0.98), rgba(0,30,60,0.98));
        border: 2px solid #4488ff; border-radius: 20px; padding: 25px;
        max-width: 650px; width: 90%; max-height: 85vh; overflow-y: auto;
        box-shadow: 0 0 50px rgba(68,136,255,0.4);
        font-family: 'Courier New', monospace; color: #fff; font-size: 13px;
      ">
        <h2 style="color:#44aaff; text-align:center; margin-bottom:5px;">🏪 Базовая станция звезды</h2>
        <p style="text-align:center; color:#888; font-size:11px; margin-bottom:15px;">Баланс: <span id="station-balance" style="color:#ffd700;font-size:16px;">${this.credits.toFixed(1)} Cred</span></p>

        <!-- Табы -->
        <div style="display:flex; gap:5px; margin-bottom:15px; flex-wrap:wrap;">
          ${['sell','buy','services','info'].map(tab => `
            <button class="station-tab" data-tab="${tab}" style="
              padding:8px 14px; border:1px solid ${this.activeTab===tab?'#44aaff':'#333'};
              background:${this.activeTab===tab?'rgba(68,136,255,0.3)':'rgba(0,30,60,0.5)'};
              color:${this.activeTab===tab?'#44aaff':'#888'}; border-radius:8px; cursor:pointer;
              font-family:'Courier New',monospace; font-size:12px;
            ">${tab==='sell'?'💰 Продать':tab==='buy'?'🛒 Купить':tab==='services'?'🔧 Услуги':'📋 Прайс'}</button>
          `).join('')}
        </div>

        <!-- Уведомления -->
        <div id="station-notification" style="
          display:none; padding:10px; margin-bottom:10px; border-radius:8px; font-size:12px; text-align:center;
        "></div>

        <!-- Контент таба -->
        <div id="station-tab-content"></div>

        <!-- Закрыть -->
        <div style="text-align:center; margin-top:15px; padding-top:15px; border-top:1px solid #333;">
          <button id="station-close-btn" style="
            padding:10px 40px; background:rgba(255,68,68,0.2); border:1px solid #ff4444;
            color:#ff4444; border-radius:8px; cursor:pointer; font-family:'Courier New',monospace;
            font-size:13px; font-weight:bold;
          ">✕ ЗАКРЫТЬ</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    // Обработчики табов
    this.container.querySelectorAll('.station-tab').forEach(btn => {
      (btn as HTMLElement).onclick = () => {
        this.activeTab = btn.getAttribute('data-tab') || 'sell';
        this.renderTab();
      };
    });

    // Закрыть
    (this.container.querySelector('#station-close-btn') as HTMLElement).onclick = () => this.hide();

    this.renderTab();
  }

  /** Показать уведомление */
  private showNotification(message: string, success: boolean) {
    const el = this.container?.querySelector('#station-notification') as HTMLElement;
    if (!el) return;
    el.style.display = 'block';
    el.textContent = message;
    el.style.background = success ? 'rgba(0,100,0,0.3)' : 'rgba(150,0,0,0.3)';
    el.style.border = `1px solid ${success ? '#4caf50' : '#ff4444'}`;
    el.style.color = success ? '#4caf50' : '#ff4444';

    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  /** Обновить баланс в UI */
  private updateBalanceUI(newBalance: number) {
    if (newBalance === null || newBalance === undefined) {
      console.warn('⚠️ updateBalanceUI: newBalance is null/undefined');
      return;
    }
    this.credits = newBalance;
    const el = this.container?.querySelector('#station-balance') as HTMLElement;
    if (el) el.textContent = `${newBalance.toFixed(1)} Cred`;
  }

  /** Выполнить запрос к серверу */
  private async apiRequest(method: string, body: any): Promise<any> {
    try {
      const requestBody = { ...body, cargo: this.playerResources };
      const resp = await fetch(`/api/station/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Player-Name': this.playerId },
        body: JSON.stringify(requestBody),
      });
      const data = await resp.json();
      return data;
    } catch (e: any) {
      return { success: false, message: `Ошибка сети: ${e.message}`, balanceAfter: this.credits };
    }
  }

  /** Перезагрузить cargo и баланс с сервера */
  private async refreshFromServer() {
    // Загружаем cargo
    try {
      const cargoResp = await fetch(`/api/station/cargo`, {
        headers: { 'X-Player-Name': this.playerId },
      });
      const cargoData = await cargoResp.json();
      if (cargoData.cargo) {
        this.playerResources = cargoData.cargo;
      }
    } catch (e) { /* ignore */ }

    // Загружаем баланс
    try {
      const resp = await fetch(`/api/station/balance`, {
        headers: { 'X-Player-Name': this.playerId },
      });
      const data = await resp.json();
      if (data.balance !== undefined && data.balance !== null) {
        this.credits = parseFloat(data.balance);
      }
    } catch (e) { /* ignore */ }
  }

  /** Рендер текущего таба */
  private renderTab() {
    const el = this.container?.querySelector('#station-tab-content') as HTMLElement;
    if (!el) return;

    // Обновляем кнопки табов
    this.container?.querySelectorAll('.station-tab').forEach(btn => {
      const tab = btn.getAttribute('data-tab');
      (btn as HTMLElement).style.borderColor = tab === this.activeTab ? '#44aaff' : '#333';
      (btn as HTMLElement).style.background = tab === this.activeTab ? 'rgba(68,136,255,0.3)' : 'rgba(0,30,60,0.5)';
      (btn as HTMLElement).style.color = tab === this.activeTab ? '#44aaff' : '#888';
    });

    switch (this.activeTab) {
      case 'sell': el.innerHTML = this.renderSellTab(); break;
      case 'buy': el.innerHTML = this.renderBuyTab(); break;
      case 'services': el.innerHTML = this.renderServicesTab(); break;
      case 'info': el.innerHTML = this.renderInfoTab(); break;
    }

    // Обработчики кнопок
    el.querySelectorAll('.station-action-btn').forEach(btn => {
      (btn as HTMLElement).onclick = () => this.handleAction(
        btn.getAttribute('data-action') || '',
        btn.getAttribute('data-resource') || ''
      );
    });
  }

  private renderSellTab(): string {
    const resources = [
      { key: 'metal', name: '⚙️ Металл', amount: this.playerResources.metal },
      { key: 'silicon', name: '💎 Кремний', amount: this.playerResources.silicon },
      { key: 'ice', name: '❄️ Лёд', amount: this.playerResources.ice },
      { key: 'rare', name: '✨ Редкие', amount: this.playerResources.rare },
      { key: 'fuel', name: '⛽ Топливо', amount: this.playerResources.fuel },
    ];

    return `
      <h3 style="color:#4caf50; margin-bottom:10px;">💰 Продать ресурсы станции</h3>
      ${resources.map(r => {
        const priceMap: Record<string, number> = { metal: ECONOMY.prices.sellMetal, silicon: ECONOMY.prices.sellSilicon, ice: ECONOMY.prices.sellIce, rare: ECONOMY.prices.sellRare, fuel: ECONOMY.prices.sellFuel };
        const price = priceMap[r.key] || 0;
        const total = r.amount * price;
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; margin:4px 0; background:rgba(0,50,0,0.2); border:1px solid rgba(76,175,80,0.3); border-radius:6px;">
          <span>${r.name}: <strong>${r.amount}</strong></span>
          <span style="color:#ffd700;">${total.toFixed(1)} Cred</span>
          <button class="station-action-btn" data-action="sell" data-resource="${r.key}" ${r.amount <= 0 ? 'disabled style="opacity:0.4;cursor:default;"' : ''} style="
            padding:5px 12px; background:rgba(76,175,80,0.2); border:1px solid #4caf50; color:#4caf50;
            border-radius:5px; cursor:pointer; font-size:11px;
          ">Продать всё</button>
        </div>`;
      }).join('')}
    `;
  }

  private renderBuyTab(): string {
    const items = [
      { key: 'metal', name: '⚙️ Металл', price: ECONOMY.prices.buyMetal },
      { key: 'silicon', name: '💎 Кремний', price: ECONOMY.prices.buySilicon },
      { key: 'ice', name: '❄️ Лёд', price: ECONOMY.prices.buyIce },
      { key: 'rare', name: '✨ Редкие', price: ECONOMY.prices.buyRare },
      { key: 'fuel', name: '⛽ Топливо', price: ECONOMY.prices.buyFuel },
      { key: 'water', name: '💧 Вода', price: ECONOMY.prices.buyWater },
    ];

    return `
      <h3 style="color:#44aaff; margin-bottom:10px;">🛒 Купить ресурсы</h3>
      ${items.map(it => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; margin:4px 0; background:rgba(0,30,80,0.3); border:1px solid rgba(68,170,255,0.3); border-radius:6px;">
        <span>${it.name}</span>
        <span style="color:#ffd700;">${it.price} Cred/ед</span>
        <div style="display:flex; gap:4px;">
          <input type="number" id="buy-${it.key}" value="10" min="1" max="9999" style="width:60px; background:#001a33; border:1px solid #333; color:#fff; padding:4px; border-radius:4px; font-family:'Courier New',monospace;">
          <button class="station-action-btn" data-action="buy" data-resource="${it.key}" style="
            padding:5px 12px; background:rgba(68,170,255,0.2); border:1px solid #44aaff; color:#44aaff;
            border-radius:5px; cursor:pointer; font-size:11px;
          ">Купить</button>
        </div>
      </div>`).join('')}
      <p style="color:#888; font-size:11px; margin-top:10px;">💡 Скидка 10% при покупке от ${ECONOMY.bulkDiscountThreshold} ед.</p>
    `;
  }

  private renderServicesTab(): string {
    const p = ECONOMY.prices;
    const radAmount = this.playerStats.radiation;
    const shieldAmount = 100 - this.playerStats.shields;
    const energyAmount = this.playerStats.energyCapacity - this.playerStats.energy;
    const waterAmount = this.playerStats.waterCapacity - this.playerResources.water;

    return `
      <h3 style="color:#ffaa44; margin-bottom:10px;">🔧 Услуги станции</h3>
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; margin:4px 0; background:rgba(80,50,0,0.2); border:1px solid rgba(255,170,68,0.3); border-radius:6px;">
        <span>☢️ Лечение радиации (${radAmount.toFixed(0)}%)</span>
        <span style="color:#ffd700;">${calcServiceCost('healRadiation', radAmount).toFixed(1)} Cred</span>
        <button class="station-action-btn" data-action="healRadiation" data-resource="" ${radAmount <= 0 ? 'disabled style="opacity:0.4;cursor:default;"' : ''} style="padding:5px 12px; background:rgba(255,170,68,0.2); border:1px solid #ffaa44; color:#ffaa44; border-radius:5px; cursor:pointer; font-size:11px;">Вылечить</button>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; margin:4px 0; background:rgba(80,50,0,0.2); border:1px solid rgba(255,170,68,0.3); border-radius:6px;">
        <span>🛡️ Восстановить щиты (${this.playerStats.shields.toFixed(0)}%)</span>
        <span style="color:#ffd700;">${calcServiceCost('healShield', shieldAmount).toFixed(1)} Cred</span>
        <button class="station-action-btn" data-action="healShield" data-resource="" ${shieldAmount <= 0 ? 'disabled style="opacity:0.4;cursor:default;"' : ''} style="padding:5px 12px; background:rgba(255,170,68,0.2); border:1px solid #ffaa44; color:#ffaa44; border-radius:5px; cursor:pointer; font-size:11px;">Восстановить</button>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; margin:4px 0; background:rgba(80,50,0,0.2); border:1px solid rgba(255,170,68,0.3); border-radius:6px;">
        <span>⚡ Зарядить энергию (${this.playerStats.energy.toFixed(0)}/${this.playerStats.energyCapacity})</span>
        <span style="color:#ffd700;">${calcServiceCost('refillEnergy', energyAmount).toFixed(1)} Cred</span>
        <button class="station-action-btn" data-action="refillEnergy" data-resource="" ${energyAmount <= 0 ? 'disabled style="opacity:0.4;cursor:default;"' : ''} style="padding:5px 12px; background:rgba(255,170,68,0.2); border:1px solid #ffaa44; color:#ffaa44; border-radius:5px; cursor:pointer; font-size:11px;">Зарядить</button>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; margin:4px 0; background:rgba(80,50,0,0.2); border:1px solid rgba(255,170,68,0.3); border-radius:6px;">
        <span>💧 Заправить воду (${this.playerResources.water.toFixed(0)}/${this.playerStats.waterCapacity})</span>
        <span style="color:#ffd700;">${calcServiceCost('refillWater', waterAmount).toFixed(1)} Cred</span>
        <button class="station-action-btn" data-action="refillWater" data-resource="" ${waterAmount <= 0 ? 'disabled style="opacity:0.4;cursor:default;"' : ''} style="padding:5px 12px; background:rgba(255,170,68,0.2); border:1px solid #ffaa44; color:#ffaa44; border-radius:5px; cursor:pointer; font-size:11px;">Заправить</button>
      </div>
    `;
  }

  private renderInfoTab(): string {
    const lines = getPriceList();
    return `<div style="font-size:12px; line-height:1.8;">${lines.map(l => `<div style="padding:2px 0;">${l}</div>`).join('')}</div>`;
  }

  private async handleAction(action: string, resource: string) {
    let result: any;

    switch (action) {
      case 'sell': {
        const amount = this.playerResources[resource as keyof typeof this.playerResources];
        if (amount <= 0) return this.showNotification('Нет ресурса для продажи', false);
        result = await this.apiRequest('sell', { resource, amount });
        if (result.success) {
          // Не устанавливаем в 0 локально — перезагрузим с сервера
        }
        break;
      }

      case 'buy': {
        const input = this.container?.querySelector(`#buy-${resource}`) as HTMLInputElement;
        const amount = input ? parseInt(input.value) || 10 : 10;
        result = await this.apiRequest('buy', { resource, amount });
        if (result.success) {
          this.playerResources[resource as keyof typeof this.playerResources] =
            (this.playerResources[resource as keyof typeof this.playerResources] || 0) + amount;
        }
        break;
      }

      case 'healRadiation': {
        const amount = Math.ceil(this.playerStats.radiation);
        if (amount <= 0) return this.showNotification('Радиации нет', false);
        result = await this.apiRequest('service', { service: 'healRadiation', amount });
        if (result.success) this.playerStats.radiation = 0;
        break;
      }

      case 'healShield': {
        const amount = Math.ceil(100 - this.playerStats.shields);
        if (amount <= 0) return this.showNotification('Щиты полные', false);
        result = await this.apiRequest('service', { service: 'healShield', amount });
        if (result.success) this.playerStats.shields = 100;
        break;
      }

      case 'refillEnergy': {
        const amount = Math.ceil(this.playerStats.energyCapacity - this.playerStats.energy);
        if (amount <= 0) return this.showNotification('Энергия полная', false);
        result = await this.apiRequest('service', { service: 'refillEnergy', amount });
        if (result.success) this.playerStats.energy = this.playerStats.energyCapacity;
        break;
      }

      case 'refillWater': {
        const amount = Math.ceil(this.playerStats.waterCapacity - this.playerResources.water);
        if (amount <= 0) return this.showNotification('Вода полная', false);
        result = await this.apiRequest('service', { service: 'refillWater', amount });
        if (result.success) this.playerResources.water = this.playerStats.waterCapacity;
        break;
      }

      default:
        return;
    }

    if (result) {
      if (result.success) {
        // Перезагружаем данные с сервера для актуального состояния
        await this.refreshFromServer();
        this.updateBalanceUI(this.credits);
        this.renderTab(); // Перерисовать с новыми данными

        // Обновляем ShipController с актуальными данными
        if (this.onTradeComplete) {
          this.onTradeComplete({
            cargo: { ...this.playerResources },
            stats: { ...this.playerStats },
          });
        }
      } else {
        this.showNotification(result.message, false);
      }
    }
  }

  hide() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}
