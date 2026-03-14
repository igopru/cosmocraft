// src/client/StationShop.ts
import * as THREE from 'three';

export interface ShopItem {
    id: string;
    name: string;
    description: string;
    price: number;
    category: 'equipment' | 'resources' | 'modules' | 'services';
    icon?: string;
}

export interface StationInfo {
    name: string;
    position: THREE.Vector3;
    distance: number;
    owner: string;
    services: string[];
}

export class StationShop {
    private ui: HTMLElement | null = null;
    private isVisible: boolean = false;
    private selectedStation: StationInfo | null = null;
    private selectedCategory: 'equipment' | 'resources' | 'modules' | 'services' = 'equipment';
    private credits: number = 10000;
    
    // Товары по категориям
    private items: Record<string, ShopItem[]> = {
        equipment: [
            { id: 'shield_boost', name: 'Щитовой бустер', description: '+50% к щитам', price: 500, category: 'equipment' },
            { id: 'engine_upgrade', name: 'Модуль двигателя', description: '+20% к скорости', price: 750, category: 'equipment' },
            { id: 'cargo_expansion', name: 'Расширение трюма', description: '+100 единиц груза', price: 300, category: 'equipment' },
            { id: 'scanner_mk2', name: 'Сканер MK-II', description: 'Улучшенный сканер ресурсов', price: 1200, category: 'equipment' },
        ],
        resources: [
            { id: 'metal', name: 'Металл', description: 'Базовый строительный материал', price: 10, category: 'resources' },
            { id: 'silicon', name: 'Кремний', description: 'Для электроники', price: 15, category: 'resources' },
            { id: 'ice', name: 'Лёд', description: 'Вода и топливо', price: 8, category: 'resources' },
            { id: 'rare_crystals', name: 'Редкие кристаллы', description: 'Для продвинутых технологий', price: 100, category: 'resources' },
        ],
        modules: [
            { id: 'solar_panel', name: 'Солнечная панель', description: 'Генерация энергии', price: 200, category: 'modules' },
            { id: 'battery', name: 'Аккумулятор', description: 'Хранение энергии', price: 150, category: 'modules' },
            { id: 'shield_gen', name: 'Генератор щита', description: 'Защита станции', price: 500, category: 'modules' },
            { id: 'turret_mount', name: 'Турель', description: 'Защитная турель', price: 800, category: 'modules' },
        ],
        services: [
            { id: 'repair', name: 'Ремонт', description: 'Полный ремонт корабля', price: 100, category: 'services' },
            { id: 'refuel', name: 'Заправка', description: 'Полная заправка топливом', price: 50, category: 'services' },
            { id: 'dock', name: 'Стыковка', description: 'Длительная стыковка', price: 25, category: 'services' },
            { id: 'info', name: 'Информация', description: 'Данные о секторе', price: 200, category: 'services' },
        ]
    };
    
    private cart: Map<string, number> = new Map();

    constructor() {
        this.setupKeyboardListener();
    }

    private setupKeyboardListener() {
        // Глобальный слушатель клавиши V
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyV') {
                e.preventDefault();
                e.stopPropagation();
                this.toggle();
            }
            // ESC закрывает магазин
            if (e.code === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    public toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    public show(station?: StationInfo) {
        if (station) {
            this.selectedStation = station;
        }
        
        if (this.ui) {
            this.ui.style.display = 'block';
            this.isVisible = true;
            return;
        }

        this.createUI();
        this.isVisible = true;
    }

    public hide() {
        if (this.ui) {
            this.ui.style.display = 'none';
        }
        this.isVisible = false;
    }

    private createUI() {
        // Основной контейнер в стиле X-Tension
        this.ui = document.createElement('div');
        this.ui.id = 'station-shop-ui';
        this.ui.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 900px;
            height: 600px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 2px solid #00d4ff;
            border-radius: 10px;
            box-shadow: 0 0 30px rgba(0, 212, 255, 0.3);
            font-family: 'Courier New', monospace;
            color: #00ff00;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        // Заголовок
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 15px 20px;
            background: linear-gradient(90deg, #0a0a1a 0%, #1a1a3e 100%);
            border-bottom: 1px solid #00d4ff;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        
        const title = document.createElement('div');
        title.style.cssText = `
            font-size: 20px;
            font-weight: bold;
            color: #00d4ff;
            text-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
        `;
        title.textContent = '🛒 STATION TRADE';
        
        const stationName = document.createElement('div');
        stationName.id = 'shop-station-name';
        stationName.style.cssText = `
            font-size: 14px;
            color: #ffaa00;
        `;
        stationName.textContent = this.selectedStation ? `Station: ${this.selectedStation.name}` : 'Station: Unknown';
        
        const credits = document.createElement('div');
        credits.id = 'shop-credits';
        credits.style.cssText = `
            font-size: 16px;
            color: #ffff00;
        `;
        credits.textContent = `Credits: ${this.credits}`;
        
        header.appendChild(title);
        header.appendChild(stationName);
        header.appendChild(credits);
        this.ui.appendChild(header);

        // Основное содержимое
        const content = document.createElement('div');
        content.style.cssText = `
            display: flex;
            flex: 1;
            overflow: hidden;
        `;

        // Левая панель - категории
        const categoriesPanel = document.createElement('div');
        categoriesPanel.style.cssText = `
            width: 180px;
            background: rgba(0, 0, 0, 0.3);
            border-right: 1px solid #00d4ff;
            padding: 10px;
        `;

        const categories: Array<{key: string; label: string; icon: string}> = [
            { key: 'equipment', label: 'Equipment', icon: '⚙️' },
            { key: 'resources', label: 'Resources', icon: '💎' },
            { key: 'modules', label: 'Modules', icon: '📦' },
            { key: 'services', label: 'Services', icon: '🔧' }
        ];

        categories.forEach(cat => {
            const btn = document.createElement('div');
            btn.textContent = `${cat.icon} ${cat.label}`;
            btn.style.cssText = `
                padding: 12px 10px;
                margin: 5px 0;
                cursor: pointer;
                border: 1px solid #335577;
                border-radius: 5px;
                transition: all 0.2s;
                font-size: 13px;
            `;
            
            if (this.selectedCategory === cat.key) {
                btn.style.background = 'rgba(0, 212, 255, 0.2)';
                btn.style.borderColor = '#00d4ff';
            }
            
            btn.onmouseover = () => {
                btn.style.background = 'rgba(0, 212, 255, 0.1)';
            };
            btn.onmouseout = () => {
                if (this.selectedCategory !== cat.key) {
                    btn.style.background = 'transparent';
                    btn.style.borderColor = '#335577';
                }
            };
            btn.onclick = () => {
                this.selectedCategory = cat.key as any;
                this.refreshCategories();
                this.refreshItems();
            };
            
            categoriesPanel.appendChild(btn);
        });

        content.appendChild(categoriesPanel);

        // Центральная панель - товары
        const itemsPanel = document.createElement('div');
        itemsPanel.style.cssText = `
            flex: 1;
            padding: 15px;
            overflow-y: auto;
        `;

        // Заголовок товаров
        const itemsHeader = document.createElement('div');
        itemsHeader.style.cssText = `
            display: grid;
            grid-template-columns: 2fr 1fr 1fr;
            padding: 10px;
            border-bottom: 1px solid #00d4ff;
            font-weight: bold;
            color: #00d4ff;
            margin-bottom: 10px;
        `;
        itemsHeader.innerHTML = '<span>Item</span><span>Price</span><span>Action</span>';
        itemsPanel.appendChild(itemsHeader);

        // Список товаров
        const itemsList = document.createElement('div');
        itemsList.id = 'shop-items-list';
        itemsPanel.appendChild(itemsList);

        content.appendChild(itemsPanel);

        // Правая панель - корзина
        const cartPanel = document.createElement('div');
        cartPanel.style.cssText = `
            width: 220px;
            background: rgba(0, 0, 0, 0.3);
            border-left: 1px solid #00d4ff;
            padding: 15px;
        `;

        const cartTitle = document.createElement('div');
        cartTitle.style.cssText = `
            font-size: 16px;
            font-weight: bold;
            color: #ffaa00;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #335577;
        `;
        cartTitle.textContent = '🛒 CART';
        cartPanel.appendChild(cartTitle);

        const cartItems = document.createElement('div');
        cartItems.id = 'shop-cart-items';
        cartItems.style.cssText = `
            max-height: 250px;
            overflow-y: auto;
            font-size: 12px;
        `;
        cartPanel.appendChild(cartItems);

        // Итого
        const cartTotal = document.createElement('div');
        cartTotal.id = 'shop-cart-total';
        cartTotal.style.cssText = `
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px solid #335577;
            font-size: 14px;
            color: #ffff00;
        `;
        cartTotal.textContent = 'Total: 0';
        cartPanel.appendChild(cartTotal);

        // Кнопки действий
        const actionButtons = document.createElement('div');
        actionButtons.style.cssText = `
            margin-top: 20px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        const buyBtn = document.createElement('button');
        buyBtn.textContent = 'BUY ALL';
        buyBtn.style.cssText = `
            padding: 10px;
            background: linear-gradient(90deg, #006600 0%, #00aa00 100%);
            border: 1px solid #00ff00;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            cursor: pointer;
            font-family: 'Courier New', monospace;
        `;
        buyBtn.onmouseover = () => buyBtn.style.background = 'linear-gradient(90deg, #008800 0%, #00cc00 100%)';
        buyBtn.onmouseout = () => buyBtn.style.background = 'linear-gradient(90deg, #006600 0%, #00aa00 100%)';
        buyBtn.onclick = () => this.buyAll();
        actionButtons.appendChild(buyBtn);

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'CLEAR CART';
        clearBtn.style.cssText = `
            padding: 10px;
            background: linear-gradient(90deg, #660000 0%, #aa0000 100%);
            border: 1px solid #ff0000;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            cursor: pointer;
            font-family: 'Courier New', monospace;
        `;
        clearBtn.onmouseover = () => clearBtn.style.background = 'linear-gradient(90deg, #880000 0%, #cc0000 100%)';
        clearBtn.onmouseout = () => clearBtn.style.background = 'linear-gradient(90deg, #660000 0%, #aa0000 100%)';
        clearBtn.onclick = () => {
            this.cart.clear();
            this.refreshCart();
        };
        actionButtons.appendChild(clearBtn);

        cartPanel.appendChild(actionButtons);
        content.appendChild(cartPanel);

        this.ui.appendChild(content);

        // Подвал с подсказками
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 10px 20px;
            background: rgba(0, 0, 0, 0.3);
            border-top: 1px solid #00d4ff;
            font-size: 11px;
            color: #888;
            display: flex;
            justify-content: space-between;
        `;
        footer.innerHTML = `
            <span>[V] Toggle Shop</span>
            <span>[ESC] Close</span>
            <span>[Click] Select Item</span>
        `;
        this.ui.appendChild(footer);

        document.body.appendChild(this.ui);

        // Обновить список товаров
        this.refreshItems();
    }

    private refreshCategories() {
        const categoriesPanel = this.ui?.querySelectorAll('#station-shop-ui > div:nth-child(2) > div:first-child > div');
        if (!categoriesPanel) return;
        
        categoriesPanel.forEach((btn: Element, index: number) => {
            const keys = ['equipment', 'resources', 'modules', 'services'];
            if (keys[index] === this.selectedCategory) {
                (btn as HTMLElement).style.background = 'rgba(0, 212, 255, 0.2)';
                (btn as HTMLElement).style.borderColor = '#00d4ff';
            } else {
                (btn as HTMLElement).style.background = 'transparent';
                (btn as HTMLElement).style.borderColor = '#335577';
            }
        });
    }

    private refreshItems() {
        const itemsList = document.getElementById('shop-items-list');
        if (!itemsList) return;

        itemsList.innerHTML = '';

        const items = this.items[this.selectedCategory];
        items.forEach(item => {
            const itemRow = document.createElement('div');
            itemRow.style.cssText = `
                display: grid;
                grid-template-columns: 2fr 1fr 1fr;
                padding: 12px 10px;
                border: 1px solid #335577;
                border-radius: 5px;
                margin-bottom: 8px;
                cursor: pointer;
                transition: all 0.2s;
                align-items: center;
            `;
            
            itemRow.onmouseover = () => {
                itemRow.style.background = 'rgba(0, 212, 255, 0.1)';
                itemRow.style.borderColor = '#00d4ff';
            };
            itemRow.onmouseout = () => {
                itemRow.style.background = 'transparent';
                itemRow.style.borderColor = '#335577';
            };

            const itemName = document.createElement('div');
            itemName.style.cssText = `
                font-size: 14px;
                color: #00ff00;
            `;
            itemName.innerHTML = `<strong>${item.name}</strong><br><span style="color: #888; font-size: 11px;">${item.description}</span>`;

            const itemPrice = document.createElement('div');
            itemPrice.style.cssText = `
                font-size: 14px;
                color: #ffff00;
            `;
            itemPrice.textContent = `${item.price} cr`;

            const itemAction = document.createElement('div');
            const addBtn = document.createElement('button');
            addBtn.textContent = '+ Add';
            addBtn.style.cssText = `
                padding: 6px 12px;
                background: #006600;
                border: 1px solid #00ff00;
                border-radius: 3px;
                color: white;
                cursor: pointer;
                font-family: 'Courier New', monospace;
                font-size: 12px;
            `;
            addBtn.onmouseover = () => addBtn.style.background = '#008800';
            addBtn.onmouseout = () => addBtn.style.background = '#006600';
            addBtn.onclick = (e) => {
                e.stopPropagation();
                this.addToCart(item);
            };

            itemAction.style.textAlign = 'center';
            itemAction.appendChild(addBtn);

            itemRow.appendChild(itemName);
            itemRow.appendChild(itemPrice);
            itemRow.appendChild(itemAction);

            itemsList.appendChild(itemRow);
        });
    }

    private addToCart(item: ShopItem) {
        const current = this.cart.get(item.id) || 0;
        this.cart.set(item.id, current + 1);
        this.refreshCart();
    }

    private refreshCart() {
        const cartItems = document.getElementById('shop-cart-items');
        const cartTotal = document.getElementById('shop-cart-total');
        if (!cartItems) return;

        cartItems.innerHTML = '';

        let total = 0;
        this.cart.forEach((quantity, itemId) => {
            const item = this.getAllItems().find(i => i.id === itemId);
            if (!item) return;

            const cartItem = document.createElement('div');
            cartItem.style.cssText = `
                padding: 8px 5px;
                border-bottom: 1px solid #335577;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;

            const itemInfo = document.createElement('div');
            itemInfo.innerHTML = `<span style="color: #00ff00;">${item.name}</span><br><span style="color: #888;">x${quantity}</span>`;

            const itemTotal = item.price * quantity;
            total += itemTotal;

            const itemPrice = document.createElement('div');
            itemPrice.style.cssText = `
                color: #ffff00;
                font-size: 12px;
            `;
            itemPrice.textContent = `${itemTotal}`;

            // Кнопка удаления
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.style.cssText = `
                margin-left: 8px;
                padding: 2px 6px;
                background: #aa0000;
                border: 1px solid #ff0000;
                border-radius: 3px;
                color: white;
                cursor: pointer;
                font-size: 14px;
            `;
            removeBtn.onclick = () => {
                this.cart.delete(itemId);
                this.refreshCart();
            };

            cartItem.appendChild(itemInfo);
            cartItem.appendChild(itemPrice);
            cartItem.appendChild(removeBtn);
            cartItems.appendChild(cartItem);
        });

        if (cartTotal) {
            cartTotal.textContent = `Total: ${total} cr`;
        }
    }

    private getAllItems(): ShopItem[] {
        return [
            ...this.items.equipment,
            ...this.items.resources,
            ...this.items.modules,
            ...this.items.services
        ];
    }

    private buyAll() {
        let total = 0;
        this.cart.forEach((quantity, itemId) => {
            const item = this.getAllItems().find(i => i.id === itemId);
            if (item) {
                total += item.price * quantity;
            }
        });

        if (total > this.credits) {
            alert('❌ Insufficient credits!');
            return;
        }

        this.credits -= total;
        
        // Обновить отображение кредитов
        const creditsEl = document.getElementById('shop-credits');
        if (creditsEl) {
            creditsEl.textContent = `Credits: ${this.credits}`;
        }

        // Очистить корзину
        this.cart.clear();
        this.refreshCart();

        console.log('✅ Purchase complete! Total:', total);
    }

    public updateStation(station: StationInfo) {
        this.selectedStation = station;
        
        const stationNameEl = document.getElementById('shop-station-name');
        if (stationNameEl) {
            stationNameEl.textContent = `Station: ${station.name}`;
        }
    }

    public setCredits(credits: number) {
        this.credits = credits;
        const creditsEl = document.getElementById('shop-credits');
        if (creditsEl) {
            creditsEl.textContent = `Credits: ${this.credits}`;
        }
    }

    public isVisibleShop(): boolean {
        return this.isVisible;
    }

    public destroy() {
        if (this.ui) {
            this.ui.remove();
            this.ui = null;
        }
        this.isVisible = false;
    }
}
