// src/ui/MissionUI.ts

/**
 * MissionUI — клиентский компонент для отображения панели заданий
 */
export class MissionUI {
  private container: HTMLElement | null = null;
  private missions: any[] = [];
  private currentFilter: string = 'all';
  private playerRank: any = null;
  private isVisible: boolean = false;
  private playerName: string | null = null;
  // Отслеживаем отвеченные задания (missionId -> был ли дан ответ)
  private answeredMissions: Set<string> = new Set();

  constructor(playerName?: string) {
    this.playerName = playerName
      || localStorage.getItem('playerName')
      || localStorage.getItem('playerName') || localStorage.getItem('pilotName');
  }

  /**
   * Установить имя пилота (если не было передано в конструкторе)
   */
  setPlayerName(name: string) {
    this.playerName = name;
    localStorage.setItem('playerName', name);
  }

  /**
   * Открыть панель заданий
   */
  async show() {
    if (this.isVisible) {
      this.hide();
      return;
    }

    this.isVisible = true;
    await this.loadMissions();
    await this.loadPlayerRank();
    this.render();
  }

  /**
   * Закрыть панель заданий
   */
  hide() {
    this.isVisible = false;
    this.answeredMissions.clear();
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  /**
   * Переключить видимость
   */
  async toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      await this.show();
    }
  }

  /**
   * Загрузить задания с сервера
   */
  private async loadMissions() {
    try {
      const name = this.playerName || localStorage.getItem('playerName') || localStorage.getItem('pilotName');
      if (!name) {
        console.warn('⚠️ Pilot name не установлен — задания недоступны');
        this.missions = [];
        return;
      }

      const response = await fetch('/api/missions', {
        headers: {
          'X-Player-Name': name,
        },
      });

      if (response.ok) {
        const data = await response.json();
        this.missions = data.missions || [];
        // Сбросить отвеченные при загрузке новых данных
        this.answeredMissions.clear();
      } else {
        const errText = await response.text();
        console.error('Ошибка загрузки заданий:', response.status, errText);
        this.missions = [];
      }
    } catch (error) {
      console.error('Ошибка загрузки заданий:', error);
      this.missions = [];
    }
  }

  /**
   * Загрузить ранг пилота
   */
  private async loadPlayerRank() {
    try {
      const name = this.playerName || localStorage.getItem('playerName') || localStorage.getItem('pilotName');
      if (!name) {
        this.playerRank = null;
        return;
      }

      const response = await fetch('/api/missions/rank/status', {
        headers: {
          'X-Player-Name': name,
        },
      });

      if (response.ok) {
        const data = await response.json();
        this.playerRank = data;
      }
    } catch (error) {
      console.error('Ошибка загрузки ранга:', error);
    }
  }

  /**
   * Отрендерить панель заданий
   */
  private render() {
    // Удалить предыдущую панель
    if (this.container) {
      this.container.remove();
    }

    // Создать контейнер
    this.container = document.createElement('div');
    this.container.id = 'mission-panel';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 5, 15, 0.92);
      z-index: 10001;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 20px;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
    `;

    // Основной контент
    const content = document.createElement('div');
    content.style.cssText = `
      width: 100%;
      max-width: 900px;
      background: linear-gradient(180deg, rgba(0, 20, 40, 0.98) 0%, rgba(0, 10, 25, 0.98) 100%);
      border: 2px solid #2a6dd4;
      border-radius: 12px;
      padding: 25px;
      box-shadow: 0 0 40px rgba(42, 109, 212, 0.4);
    `;

    // Шапка
    content.appendChild(this.renderHeader());

    // Фильтры
    content.appendChild(this.renderFilters());

    // Список заданий
    content.appendChild(this.renderMissionList());

    this.container.appendChild(content);
    document.body.appendChild(this.container);

    // Закрытие по ESC
    const escHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        this.hide();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Закрытие по клику вне панели
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.hide();
      }
    });
  }

  /**
   * Рендер шапки
   */
  private renderHeader(): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid rgba(42, 109, 212, 0.3);
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      font-size: 28px;
      font-weight: bold;
      color: #4a9eff;
      text-shadow: 0 0 20px rgba(74, 158, 255, 0.5);
    `;
    title.textContent = '📋 ЗАДАНИЯ ПИЛОТА';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: rgba(255, 50, 50, 0.2);
      border: 1px solid rgba(255, 50, 50, 0.5);
      color: #ff5555;
      font-size: 24px;
      padding: 5px 15px;
      cursor: pointer;
      border-radius: 5px;
      transition: all 0.2s;
    `;
    closeBtn.onmouseover = () => {
      closeBtn.style.background = 'rgba(255, 50, 50, 0.4)';
    };
    closeBtn.onmouseout = () => {
      closeBtn.style.background = 'rgba(255, 50, 50, 0.2)';
    };
    closeBtn.onclick = () => this.hide();

    header.appendChild(title);

    // Информация о ранге
    if (this.playerRank) {
      const rankInfo = document.createElement('div');
      rankInfo.style.cssText = `
        text-align: right;
        color: #aaa;
        font-size: 14px;
      `;
      rankInfo.innerHTML = `
        <div style="color: ${this.playerRank.rank?.color || '#fff'}; font-size: 18px; font-weight: bold;">
          ${this.playerRank.rank?.icon || ''} ${this.playerRank.rank?.title || 'Новичок'}
        </div>
        <div>XP: ${this.playerRank.total_xp || 0} | Заданий: ${this.playerRank.missions_completed || 0}</div>
      `;
      header.appendChild(rankInfo);
    }

    header.appendChild(closeBtn);

    return header;
  }

  /**
   * Рендер фильтров
   */
  private renderFilters(): HTMLElement {
    const filters = document.createElement('div');
    filters.style.cssText = `
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    `;

    const categories = [
      { id: 'all', label: 'Все' },
      { id: 'history', label: '📜 История' },
      { id: 'science', label: '🔬 Наука' },
      { id: 'exploration', label: '🧭 Исследования' },
      { id: 'special', label: '⭐ Особые' },
    ];

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.textContent = cat.label;
      btn.style.cssText = `
        padding: 8px 16px;
        background: ${this.currentFilter === cat.id ? 'rgba(42, 109, 212, 0.4)' : 'rgba(255, 255, 255, 0.05)'};
        border: 1px solid ${this.currentFilter === cat.id ? '#2a6dd4' : 'rgba(255, 255, 255, 0.1)'};
        color: ${this.currentFilter === cat.id ? '#4a9eff' : '#888'};
        border-radius: 6px;
        cursor: pointer;
        font-family: 'Courier New', monospace;
        font-size: 13px;
        transition: all 0.2s;
      `;
      btn.onmouseover = () => {
        if (this.currentFilter !== cat.id) {
          btn.style.background = 'rgba(255, 255, 255, 0.1)';
        }
      };
      btn.onmouseout = () => {
        if (this.currentFilter !== cat.id) {
          btn.style.background = 'rgba(255, 255, 255, 0.05)';
        }
      };
      btn.onclick = () => {
        this.currentFilter = cat.id;
        this.answeredMissions.clear();
        this.render();
      };
      filters.appendChild(btn);
    });

    return filters;
  }

  /**
   * Рендер списка заданий
   */
  private renderMissionList(): HTMLElement {
    const list = document.createElement('div');
    list.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 15px;
    `;

    const filtered = this.currentFilter === 'all'
      ? this.missions
      : this.missions.filter(m => m.category === this.currentFilter);

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `
        text-align: center;
        padding: 40px;
        color: #666;
        font-size: 16px;
      `;
      empty.textContent = '📭 Задания не найдены';
      list.appendChild(empty);
      return list;
    }

    filtered.forEach(mission => {
      list.appendChild(this.renderMissionCard(mission));
    });

    return list;
  }

  /**
   * Рендер карточки задания
   */
  private renderMissionCard(mission: any): HTMLElement {
    const card = document.createElement('div');
    const statusColors: any = {
      available: { bg: 'rgba(100, 100, 100, 0.1)', border: '#666', label: '🆕 Доступно' },
      in_progress: { bg: 'rgba(255, 165, 0, 0.1)', border: '#ffa500', label: '⏳ В процессе' },
      completed: { bg: 'rgba(0, 255, 0, 0.1)', border: '#00cc00', label: '✅ Выполнено' },
    };

    const status = statusColors[mission.playerStatus || 'available'];

    card.style.cssText = `
      background: ${status.bg};
      border: 2px solid ${status.border};
      border-radius: 10px;
      padding: 18px;
      transition: all 0.2s;
    `;
    card.onmouseover = () => {
      card.style.boxShadow = `0 0 20px ${status.border}40`;
    };
    card.onmouseout = () => {
      card.style.boxShadow = 'none';
    };

    // Заголовок
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      font-size: 18px;
      font-weight: bold;
      color: #fff;
    `;
    title.textContent = mission.title;

    const statusBadge = document.createElement('span');
    statusBadge.textContent = status.label;
    statusBadge.style.cssText = `
      background: ${status.border}20;
      border: 1px solid ${status.border};
      color: ${status.border};
      padding: 4px 10px;
      border-radius: 5px;
      font-size: 12px;
      white-space: nowrap;
    `;

    header.appendChild(title);
    header.appendChild(statusBadge);
    card.appendChild(header);

    // Описание
    const desc = document.createElement('div');
    desc.style.cssText = `
      color: #bbb;
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 12px;
      white-space: pre-line;
    `;
    desc.textContent = mission.description;
    card.appendChild(desc);

    // Сложность и категория
    const meta = document.createElement('div');
    meta.style.cssText = `
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
      font-size: 12px;
    `;

    const diffColors: any = {
      easy: '#4caf50',
      medium: '#ff9800',
      hard: '#f44336',
      legendary: '#9c27b0',
    };

    meta.innerHTML = `
      <span style="color: ${diffColors[mission.difficulty] || '#fff'}">
        ${mission.difficulty === 'easy' ? '🟢' : mission.difficulty === 'medium' ? '🟡' : mission.difficulty === 'hard' ? '🔴' : '🟣'}
        ${mission.difficulty}
      </span>
      <span style="color: #888">📂 ${mission.category}</span>
      <span style="color: #888">🎯 ${mission.type === 'quiz' ? 'Викторина' : mission.type === 'search' ? 'Поиск' : mission.type === 'flight' ? 'Полёт' : mission.type === 'visit' ? 'Посещение' : mission.type}</span>
    `;
    card.appendChild(meta);

    // Награды
    const rewards = this.renderRewards(mission);
    if (rewards) {
      card.appendChild(rewards);
    }

    // Кнопки действий
    const actions = this.renderMissionActions(mission);
    if (actions) {
      card.appendChild(actions);
    }

    return card;
  }

  /**
   * Рендер наград
   */
  private renderRewards(mission: any): HTMLElement | null {
    const rewardItems: string[] = [];
    if (mission.reward_xp > 0) rewardItems.push(`⭐ ${mission.reward_xp} XP`);
    if (mission.reward_fuel > 0) rewardItems.push(`⛽ ${mission.reward_fuel} топлива`);
    if (mission.reward_metal > 0) rewardItems.push(`🔩 ${mission.reward_metal} металла`);
    if (mission.reward_silicon > 0) rewardItems.push(`💎 ${mission.reward_silicon} кремния`);
    if (mission.reward_ice > 0) rewardItems.push(`❄️ ${mission.reward_ice} льда`);
    if (mission.reward_rare > 0) rewardItems.push(`✨ ${mission.reward_rare} редких`);

    if (rewardItems.length === 0) return null;

    const container = document.createElement('div');
    container.style.cssText = `
      background: rgba(255, 215, 0, 0.05);
      border: 1px solid rgba(255, 215, 0, 0.2);
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #ffd700;
    `;
    container.textContent = '🎁 Награды: ' + rewardItems.join(', ');
    return container;
  }

  /**
   * Рендер кнопок действий
   */
  private renderMissionActions(mission: any): HTMLElement | null {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    `;

    // Если викторина и в процессе — показать варианты ответа
    if (mission.type === 'quiz' && mission.question && mission.options) {
      if (mission.playerStatus === 'in_progress' || mission.playerStatus === 'available') {
        const alreadyAnswered = this.answeredMissions.has(mission.id);

        const questionText = document.createElement('div');
        questionText.style.cssText = `
          width: 100%;
          margin-bottom: 10px;
          color: ${alreadyAnswered ? '#888' : '#fff'};
          font-size: 14px;
          font-weight: bold;
        `;
        questionText.textContent = `${alreadyAnswered ? '🔒 ' : ''}${mission.question}`;
        container.appendChild(questionText);

        const progress = mission.playerProgress;
        const wasCorrect = progress?.is_correct === true;
        const selectedAnswer = progress?.answer_selected;

        mission.options.forEach((option: string, index: number) => {
          const btn = document.createElement('button');
          btn.textContent = option;

          const isDisabled = alreadyAnswered || wasCorrect;
          const isSelected = selectedAnswer === index;
          const isCorrectAnswer = index === mission.correct_answer;

          let bg, border, textColor;
          if (isDisabled) {
            if (isCorrectAnswer) {
              bg = 'rgba(76, 175, 80, 0.25)';
              border = 'rgba(76, 175, 80, 0.7)';
              textColor = '#4caf50';
            } else if (isSelected && !wasCorrect) {
              bg = 'rgba(244, 67, 54, 0.25)';
              border = 'rgba(244, 67, 54, 0.7)';
              textColor = '#f44336';
            } else {
              bg = 'rgba(100, 100, 100, 0.1)';
              border = 'rgba(100, 100, 100, 0.2)';
              textColor = '#555';
            }
          } else {
            bg = 'rgba(42, 109, 212, 0.2)';
            border = 'rgba(42, 109, 212, 0.5)';
            textColor = '#4a9eff';
          }

          btn.style.cssText = `
            flex: 1;
            min-width: 180px;
            padding: 10px;
            background: ${bg};
            border: 1px solid ${border};
            color: ${textColor};
            border-radius: 6px;
            cursor: ${isDisabled ? 'not-allowed' : 'pointer'};
            font-family: 'Courier New', monospace;
            font-size: 13px;
            transition: all 0.2s;
            opacity: ${isDisabled ? '0.7' : '1'};
            position: relative;
          `;

          if (!isDisabled) {
            btn.onmouseover = () => {
              btn.style.background = 'rgba(42, 109, 212, 0.4)';
            };
            btn.onmouseout = () => {
              btn.style.background = bg;
            };
            btn.onclick = () => {
              this.answeredMissions.add(mission.id);
              this.submitAnswer(mission.id, index);
            };
          }

          // Маркеры правильного/неправильного ответа
          if (isDisabled && isCorrectAnswer) {
            btn.textContent += ' ✓';
          } else if (isDisabled && isSelected && !wasCorrect) {
            btn.textContent += ' ✗';
          }

          container.appendChild(btn);
        });
      }
    } else if (mission.playerStatus === 'available') {
      // Кнопка "Начать"
      const startBtn = document.createElement('button');
      startBtn.textContent = '🚀 Начать задание';
      startBtn.style.cssText = `
        padding: 10px 20px;
        background: rgba(76, 175, 80, 0.2);
        border: 1px solid rgba(76, 175, 80, 0.5);
        color: #4caf50;
        border-radius: 6px;
        cursor: pointer;
        font-family: 'Courier New', monospace;
        font-size: 13px;
        transition: all 0.2s;
      `;
      startBtn.onmouseover = () => {
        startBtn.style.background = 'rgba(76, 175, 80, 0.4)';
      };
      startBtn.onmouseout = () => {
        startBtn.style.background = 'rgba(76, 175, 80, 0.2)';
      };
      startBtn.onclick = () => this.startMission(mission.id);
      container.appendChild(startBtn);
    } else if (mission.playerStatus === 'completed') {
      const doneLabel = document.createElement('div');
      doneLabel.textContent = '✅ Задание выполнено';
      doneLabel.style.cssText = `
        padding: 8px 16px;
        background: rgba(0, 204, 0, 0.1);
        border: 1px solid rgba(0, 204, 0, 0.3);
        color: #00cc00;
        border-radius: 6px;
        font-size: 13px;
      `;
      container.appendChild(doneLabel);
    }

    return container.children.length > 0 ? container : null;
  }

  /**
   * Отправить ответ на викторину
   */
  private async submitAnswer(missionId: string, answer: number) {
    try {
      const name = this.playerName || localStorage.getItem('playerName') || localStorage.getItem('pilotName');
      const response = await fetch(`/api/missions/${missionId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Player-Name': name || '',
        },
        body: JSON.stringify({ answer }),
      });

      const data = await response.json();

      if (data.success) {
        this.showGameDialog(data.message, data.success);
        await this.loadMissions();
        await this.loadPlayerRank();
        this.render();
      } else {
        this.showGameDialog(data.message || 'Ошибка при отправке ответа', false);
        // Всё равно перерисовать чтобы показать какой ответ был выбран
        await this.loadMissions();
        this.render();
      }
    } catch (error) {
      console.error('Ошибка отправки ответа:', error);
      this.showGameDialog('Ошибка соединения с сервером', false);
    }
  }

  /**
   * Начать задание
   */
  private async startMission(missionId: string) {
    try {
      const name = this.playerName || localStorage.getItem('playerName') || localStorage.getItem('pilotName');
      const response = await fetch(`/api/missions/${missionId}/start`, {
        method: 'POST',
        headers: {
          'X-Player-Name': name || '',
        },
      });

      const data = await response.json();

      if (data.success) {
        this.showGameDialog(data.message, true);
        await this.loadMissions();
        this.render();
      } else {
        this.showGameDialog(data.message || 'Ошибка при начале задания', false);
      }
    } catch (error) {
      console.error('Ошибка начала задания:', error);
      this.showGameDialog('Ошибка соединения с сервером', false);
    }
  }

  /**
   * Показать модальное окно в стиле игры
   */
  private showGameDialog(message: string, isSuccess: boolean) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 20000;
      display: flex;
      justify-content: center;
      align-items: center;
    `;

    const color = isSuccess ? '#4caf50' : '#f44336';
    const icon = isSuccess ? '✅' : '❌';
    const borderColor = isSuccess ? '#4caf50' : '#f44336';
    const glowColor = isSuccess ? 'rgba(76, 175, 80, 0.4)' : 'rgba(244, 67, 54, 0.4)';

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: linear-gradient(135deg, rgba(0, 15, 30, 0.98) 0%, rgba(0, 30, 60, 0.98) 100%);
      border: 2px solid ${borderColor};
      border-radius: 15px;
      padding: 30px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 0 40px ${glowColor}, inset 0 0 20px rgba(0, 0, 0, 0.3);
      text-align: center;
      animation: dialogPopIn 0.3s ease-out;
    `;

    // Добавляем анимацию
    const style = document.createElement('style');
    style.textContent = `
      @keyframes dialogPopIn {
        0% { transform: scale(0.8); opacity: 0; }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    dialog.innerHTML = `
      <div style="font-size: 48px; margin-bottom: 15px;">${icon}</div>
      <div style="
        color: #fff;
        font-family: 'Courier New', monospace;
        font-size: 16px;
        line-height: 1.6;
        margin-bottom: 20px;
        white-space: pre-line;
      ">${message.replace(/\n/g, '<br>')}</div>
      <button class="game-dialog-close" style="
        padding: 10px 30px;
        background: ${borderColor};
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        font-weight: bold;
        transition: all 0.2s;
      ">ЗАКРЫТЬ</button>
    `;

    const closeBtn = dialog.querySelector('.game-dialog-close') as HTMLElement;

    const close = () => {
      overlay.remove();
      style.remove();
    };

    closeBtn.onclick = close;
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'Enter') close();
    }, { once: true });

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Автофокус на кнопку
    closeBtn.focus();
  }

  /**
   * Получить контейнер
   */
  getContainer(): HTMLElement | null {
    return this.container;
  }
}
