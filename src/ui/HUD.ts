// src/ui/HUD.ts
import { ShipStatus } from '../client/ShipController.js';

export class HUD {
    private coordinatesEl: HTMLElement;
    private sectorEl: HTMLElement;
    private temperatureEl: HTMLElement;
    private radiationEl: HTMLElement;
    private resourcesEl: Record<string, HTMLElement>;
    private warningEl: HTMLElement;
    private worldInfoEl: HTMLElement;
    private shipStatusEl: HTMLElement | null = null;

    constructor() {
        console.log('HUD constructor');

        this.coordinatesEl = document.getElementById('coordinates') as HTMLElement;
        this.sectorEl = document.getElementById('sector') as HTMLElement;
        this.temperatureEl = document.getElementById('temperature') as HTMLElement;
        this.radiationEl = document.getElementById('radiation') as HTMLElement;
        this.warningEl = document.getElementById('warning') as HTMLElement;

        // Создаем элемент для информации о мире, если его нет
        this.worldInfoEl = document.getElementById('world-info') as HTMLElement;
        if (!this.worldInfoEl) {
            this.worldInfoEl = document.createElement('div');
            this.worldInfoEl.id = 'world-info';
            this.worldInfoEl.style.position = 'absolute';
            this.worldInfoEl.style.top = '10px';
            this.worldInfoEl.style.right = '10px';
            this.worldInfoEl.style.background = 'rgba(0,0,0,0.7)';
            this.worldInfoEl.style.color = 'white';
            this.worldInfoEl.style.padding = '10px';
            this.worldInfoEl.style.borderRadius = '5px';
            this.worldInfoEl.style.border = '1px solid #444';
            this.worldInfoEl.style.zIndex = '100';
            document.body.appendChild(this.worldInfoEl);
        }

        this.resourcesEl = {
            metal: document.getElementById('metal') as HTMLElement,
            silicon: document.getElementById('silicon') as HTMLElement,
            ice: document.getElementById('ice') as HTMLElement,
            rare: document.getElementById('rare') as HTMLElement
        };

        // Создаём элемент для статуса корабля
        this.createShipStatusUI();
    }

    private createShipStatusUI() {
        this.shipStatusEl = document.createElement('div');
        this.shipStatusEl.id = 'ship-status';
        this.shipStatusEl.style.cssText = `
            position: absolute;
            bottom: 100px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px;
            border-radius: 10px;
            border: 1px solid #4466aa;
            z-index: 100;
            min-width: 220px;
        `;
        this.shipStatusEl.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 10px; color: #ffaa33;">🚀 Корабль</div>
            <div>Скорость: <span id="ship-speed">0</span> м/с</div>
            <div>Тяга: <span id="ship-throttle">0</span>%</div>
            <div>Макс: <span id="ship-max-speed">100</span> м/с</div>
            <div style="margin-top: 10px;">🛡️ Щиты: <span id="ship-shields">100</span>%</div>
            
            <div style="margin-top: 15px; font-weight: bold; color: #00ffaa;">📦 Грузовой отсек</div>
            <div style="font-size: 13px; margin-top: 5px;">
                <span style="color: #888;">⚙️ Металл:</span> <span id="cargo-metal">0</span><br>
                <span style="color: #888;">💎 Кремний:</span> <span id="cargo-silicon">0</span><br>
                <span style="color: #888;">❄️ Лёд:</span> <span id="cargo-ice">0</span><br>
                <span style="color: #888;">🌟 Редкие:</span> <span id="cargo-rare">0</span>
            </div>
            <div style="margin-top: 10px; font-size: 12px;">📦 Всего: <span id="cargo-total">0</span> ед.</div>
            
            <div style="margin-top: 10px; font-size: 12px;">
                <span id="ship-cargo" style="color: #666;">🚪 Люк: ЗАКРЫТ</span>
            </div>
            
            <div style="margin-top: 10px; font-size: 12px;">
                <span id="ship-satellites" style="color: #666;">🛰️ Спутники: 0</span>
            </div>
            
            <div style="margin-top: 10px; font-size: 12px;">
                <span id="ship-turbo" style="color: #666;">⚡ Турбо</span> |
                <span id="ship-seta" style="color: #666;">⏱️ S.E.T.A</span>
            </div>
            <div style="margin-top: 5px; font-size: 12px;">
                <span id="ship-laser" style="color: #666;">🔥 Лазер</span> |
                Ракета: <span id="ship-missile">None</span>
            </div>
        `;
        document.body.appendChild(this.shipStatusEl);
    }

    public setShipStatus(status: ShipStatus) {
        if (!this.shipStatusEl) return;

        const speedEl = document.getElementById('ship-speed');
        const throttleEl = document.getElementById('ship-throttle');
        const maxSpeedEl = document.getElementById('ship-max-speed');
        const turboEl = document.getElementById('ship-turbo');
        const setaEl = document.getElementById('ship-seta');
        const cargoEl = document.getElementById('ship-cargo');
        const laserEl = document.getElementById('ship-laser');
        const missileEl = document.getElementById('ship-missile');
        const shieldsEl = document.getElementById('ship-shields');
        const satellitesEl = document.getElementById('ship-satellites');

        // Элементы груза
        const cargoMetalEl = document.getElementById('cargo-metal');
        const cargoSiliconEl = document.getElementById('cargo-silicon');
        const cargoIceEl = document.getElementById('cargo-ice');
        const cargoRareEl = document.getElementById('cargo-rare');
        const cargoTotalEl = document.getElementById('cargo-total');

        if (speedEl) speedEl.textContent = Math.round(status.speed).toString();
        if (throttleEl) throttleEl.textContent = status.throttle.toString();
        if (maxSpeedEl) maxSpeedEl.textContent = Math.round(status.maxSpeed).toString();
        if (shieldsEl) shieldsEl.textContent = status.shields.toString();

        // Цвет щитов
        if (shieldsEl) {
            if (status.shields > 50) {
                shieldsEl.style.color = '#00ff00';
            } else if (status.shields > 20) {
                shieldsEl.style.color = '#ffaa00';
            } else {
                shieldsEl.style.color = '#ff0000';
            }
        }

        // Груз
        if (cargoMetalEl) cargoMetalEl.textContent = status.cargo.metal.toString();
        if (cargoSiliconEl) cargoSiliconEl.textContent = status.cargo.silicon.toString();
        if (cargoIceEl) cargoIceEl.textContent = status.cargo.ice.toString();
        if (cargoRareEl) cargoRareEl.textContent = status.cargo.rare.toString();
        
        const totalCargo = status.cargo.metal + status.cargo.silicon + status.cargo.ice + status.cargo.rare;
        if (cargoTotalEl) cargoTotalEl.textContent = totalCargo.toString();

        // Люк
        if (cargoEl) {
            cargoEl.textContent = `🚪 Люк: ${status.cargoBayOpen ? 'ОТКРЫТ' : 'ЗАКРЫТ'}`;
            cargoEl.style.color = status.cargoBayOpen ? '#00ff00' : '#666';
        }

        // Спутники
        if (satellitesEl) {
            satellitesEl.textContent = `🛰️ Спутники: ${status.satellitesDeployed}`;
            satellitesEl.style.color = status.satellitesDeployed > 0 ? '#00ff00' : '#666';
        }

        if (turboEl) turboEl.style.color = status.turboMode ? '#00ff00' : '#666';
        if (setaEl) setaEl.style.color = status.setaMode ? '#00ff00' : '#666';
        if (laserEl) laserEl.style.color = status.laserActive ? '#ff0000' : '#666';
        if (missileEl) missileEl.textContent = status.currentMissile;
    }
    
    public update(data: any) {
        if (this.coordinatesEl && data.position) {
            this.coordinatesEl.textContent = `X: ${Math.round(data.position.x)} Y: ${Math.round(data.position.y)} Z: ${Math.round(data.position.z)}`;
        }
        
        if (this.sectorEl && data.sector) {
            this.sectorEl.textContent = `Сектор: ${data.sector}`;
        }
        
        if (this.temperatureEl && data.temperature !== undefined) {
            this.temperatureEl.textContent = `Температура: ${Math.round(data.temperature)}K`;
        }
        
        if (this.radiationEl && data.radiation !== undefined) {
            this.radiationEl.textContent = `Радиация: ${Math.round(data.radiation)} rad/s`;
        }
        
        if (data.resources) {
            if (this.resourcesEl.metal) this.resourcesEl.metal.textContent = data.resources.metal?.toString() || '0';
            if (this.resourcesEl.silicon) this.resourcesEl.silicon.textContent = data.resources.silicon?.toString() || '0';
            if (this.resourcesEl.ice) this.resourcesEl.ice.textContent = data.resources.ice?.toString() || '0';
            if (this.resourcesEl.rare) this.resourcesEl.rare.textContent = data.resources.rare?.toString() || '0';
        }
    }
    
    public showMessage(message: string) {
        if (this.worldInfoEl) {
            this.worldInfoEl.innerHTML = message;
            this.worldInfoEl.style.display = 'block';
            
            setTimeout(() => {
                this.worldInfoEl.style.display = 'none';
            }, 5000);
        }
    }
    
    public updateWorldInfo(world: any, legacy: any) {
        if (this.worldInfoEl) {
            this.worldInfoEl.innerHTML = `
                <div style="font-weight: bold;">🌍 Мир #${world.world_number}</div>
                <div style="font-size: 12px;">${world.name || ''}</div>
                <div style="margin-top: 5px;">🏆 Престиж: ${legacy?.prestige_level || 1}</div>
                <div>📊 Миров пройдено: ${legacy?.total_worlds_completed || 0}</div>
            `;
            this.worldInfoEl.style.display = 'block';
        }
    }
    
    public showWarning(message: string) {
        if (this.warningEl) {
            this.warningEl.textContent = message;
            this.warningEl.style.display = 'block';
            
            setTimeout(() => {
                this.warningEl.style.display = 'none';
            }, 3000);
        }
    }
    
    public showMiningProgress(progress: number) {
        const progressEl = document.getElementById('mining-progress');
        const fillEl = document.getElementById('mining-fill');
        
        if (progressEl && fillEl) {
            progressEl.style.display = 'block';
            fillEl.style.width = `${progress * 100}%`;
            
            if (progress >= 1) {
                setTimeout(() => {
                    progressEl.style.display = 'none';
                }, 500);
            }
        }
    }
}
