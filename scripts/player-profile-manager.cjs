// scripts/player-profile-manager.cjs
// Менеджер профилей игроков CosmoCraft

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const PLAYERS_DIR = path.join(__dirname, '..', 'players');
const CONFIG_DIR = path.join(__dirname, '..', 'config');

// Создаём директорию игроков если нет
if (!fs.existsSync(PLAYERS_DIR)) {
    fs.mkdirSync(PLAYERS_DIR, { recursive: true });
    console.log('📁 Создана директория для профилей игроков:', PLAYERS_DIR);
}

/**
 * Загрузка профиля игрока
 * @param {string} playerName - Имя игрока
 * @returns {Object} Конфигурация игрока
 */
function loadPlayerProfile(playerName) {
    const playerDir = path.join(PLAYERS_DIR, playerName);
    const resourcesFile = path.join(playerDir, 'resources.env');
    
    // Если профиль не существует - создаём
    if (!fs.existsSync(playerDir)) {
        console.log(`🆕 Создание нового профиля для игрока: ${playerName}`);
        createPlayerProfile(playerName);
    }
    
    // Загружаем ресурсы
    const resourcesConfig = fs.existsSync(resourcesFile) 
        ? dotenv.parse(fs.readFileSync(resourcesFile))
        : {};
    
    return {
        name: playerName,
        resources: resourcesConfig,
        stats: loadPlayerStats(playerName),
        saves: loadPlayerSaves(playerName)
    };
}

/**
 * Создание профиля игрока
 * @param {string} playerName 
 */
function createPlayerProfile(playerName) {
    const playerDir = path.join(PLAYERS_DIR, playerName);
    
    // Создаём директорию игрока
    if (!fs.existsSync(playerDir)) {
        fs.mkdirSync(playerDir, { recursive: true });
    }
    
    // Копируем базовый конфиг ресурсов
    const baseResourcesFile = path.join(CONFIG_DIR, 'resources.env');
    const playerResourcesFile = path.join(playerDir, 'resources.env');
    
    if (fs.existsSync(baseResourcesFile)) {
        fs.copyFileSync(baseResourcesFile, playerResourcesFile);
        console.log(`📋 Скопирован конфиг ресурсов для ${playerName}`);
    } else {
        // Создаём базовый конфиг
        const defaultResources = `# Ресурсы игрока ${playerName}
ENERGY_CAPACITY=1000
ENERGY_START=500
WATER_TANK_CAPACITY=100
WATER_TANK_START=100
`;
        fs.writeFileSync(playerResourcesFile, defaultResources);
    }
    
    // Создаём файл статистики
    const statsFile = path.join(playerDir, 'stats.json');
    const defaultStats = {
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        totalResourcesMined: 0,
        deathByStar: 0,
        deathByAsteroid: 0,
        bestRun: {
            metal: 0,
            silicon: 0,
            ice: 0,
            rare: 0
        }
    };
    fs.writeFileSync(statsFile, JSON.stringify(defaultStats, null, 2));
    
    // Создаём файл сохранений
    const savesFile = path.join(playerDir, 'saves.json');
    fs.writeFileSync(savesFile, JSON.stringify([], null, 2));
    
    console.log(`✅ Профиль создан: ${playerDir}`);
}

/**
 * Загрузка статистики игрока
 * @param {string} playerName 
 */
function loadPlayerStats(playerName) {
    const statsFile = path.join(PLAYERS_DIR, playerName, 'stats.json');
    
    if (fs.existsSync(statsFile)) {
        return JSON.parse(fs.readFileSync(statsFile));
    }
    
    return {
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        totalResourcesMined: 0,
        deathByStar: 0,
        deathByAsteroid: 0,
        bestRun: { metal: 0, silicon: 0, ice: 0, rare: 0 }
    };
}

/**
 * Сохранение статистики игрока
 * @param {string} playerName 
 * @param {Object} stats 
 */
function savePlayerStats(playerName, stats) {
    const statsFile = path.join(PLAYERS_DIR, playerName, 'stats.json');
    fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    console.log(`📊 Статистика сохранена для ${playerName}`);
}

/**
 * Загрузка сохранений игрока
 * @param {string} playerName 
 */
function loadPlayerSaves(playerName) {
    const savesFile = path.join(PLAYERS_DIR, playerName, 'saves.json');
    
    if (fs.existsSync(savesFile)) {
        return JSON.parse(fs.readFileSync(savesFile));
    }
    
    return [];
}

/**
 * Сохранение игры
 * @param {string} playerName 
 * @param {Object} saveData 
 */
function saveGame(playerName, saveData) {
    const saves = loadPlayerSaves(playerName);
    saves.push({
        timestamp: Date.now(),
        ...saveData
    });
    
    const savesFile = path.join(PLAYERS_DIR, playerName, 'saves.json');
    fs.writeFileSync(savesFile, JSON.stringify(saves, null, 2));
    console.log(`💾 Игра сохранена для ${playerName}`);
}

/**
 * Обновление статистики после смерти
 * @param {string} playerName 
 * @param {Object} deathStats 
 */
function updateStatsOnDeath(playerName, deathStats) {
    const stats = loadPlayerStats(playerName);
    
    stats.gamesPlayed++;
    stats.gamesLost++;
    
    if (deathStats.cause === 'star') {
        stats.deathByStar++;
    } else if (deathStats.cause === 'asteroid') {
        stats.deathByAsteroid++;
    }
    
    const totalResources = deathStats.cargo.metal + 
                          deathStats.cargo.silicon + 
                          deathStats.cargo.ice + 
                          deathStats.cargo.rare;
    
    stats.totalResourcesMined += totalResources;
    
    // Проверяем рекорд
    const currentBest = stats.bestRun.metal + stats.bestRun.silicon + 
                       stats.bestRun.ice + stats.bestRun.rare;
    
    if (totalResources > currentBest) {
        stats.bestRun = { ...deathStats.cargo };
        console.log(`🏆 Новый рекорд для ${playerName}!`);
    }
    
    savePlayerStats(playerName, stats);
}

/**
 * Список всех игроков
 */
function listAllPlayers() {
    if (!fs.existsSync(PLAYERS_DIR)) {
        return [];
    }
    
    return fs.readdirSync(PLAYERS_DIR)
        .filter(name => fs.statSync(path.join(PLAYERS_DIR, name)).isDirectory());
}

// Экспорт функций
module.exports = {
    loadPlayerProfile,
    createPlayerProfile,
    savePlayerStats,
    saveGame,
    updateStatsOnDeath,
    listAllPlayers
};

// Тест
if (require.main === module) {
    console.log('📁 Менеджер профилей игроков CosmoCraft');
    console.log('Игроки:', listAllPlayers());
}
