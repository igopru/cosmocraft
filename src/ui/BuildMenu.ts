// src/ui/BuildMenu.ts
import { WebSocketClient } from '../client/networking/WebSocketClient.js';

export class BuildMenu {
    private container: HTMLDivElement;
    private wsClient: WebSocketClient;
    
    constructor(wsClient: WebSocketClient) {
        console.log('BuildMenu constructor');
        this.wsClient = wsClient;
        this.container = document.getElementById('build-menu') as HTMLDivElement;
        
        if (this.container) {
            this.createMenu();
        }
    }
    
    private createMenu() {
        this.container.innerHTML = '';
        this.container.style.display = 'flex';
        this.container.style.gap = '10px';
        this.container.style.padding = '10px';
        this.container.style.background = 'rgba(0,0,0,0.8)';
        this.container.style.borderRadius = '10px';
        
        const modules = [
            { type: 'habitat', name: 'Жилой модуль', cost: '100M' },
            { type: 'production', name: 'Производство', cost: '200M' },
            { type: 'storage', name: 'Склад', cost: '50M' },
            { type: 'solar', name: 'Солнечные панели', cost: '50M' },
            { type: 'turret', name: 'Турель', cost: '150M' }
        ];
        
        modules.forEach(module => {
            const btn = document.createElement('button');
            btn.textContent = module.name;
            btn.title = `Стоимость: ${module.cost}`;
            
            btn.style.padding = '10px 15px';
            btn.style.background = '#333';
            btn.style.color = 'white';
            btn.style.border = '1px solid #666';
            btn.style.borderRadius = '5px';
            btn.style.cursor = 'pointer';
            
            btn.onclick = () => {
                console.log('Build:', module.type);
                // Здесь будет вызов строительства
                alert(`Строительство ${module.name} пока в разработке`);
            };
            
            this.container.appendChild(btn);
        });
    }
}
