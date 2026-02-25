// src/ui/HUD.ts
export class HUD {
    private coordinatesEl: HTMLElement;
    private sectorEl: HTMLElement;
    private temperatureEl: HTMLElement;
    private radiationEl: HTMLElement;
    private resourcesEl: Record<string, HTMLElement>;
    private warningEl: HTMLElement;
    private worldInfoEl: HTMLElement;
    
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
