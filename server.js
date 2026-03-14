// server.js
require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
        module: 'commonjs'
    }
});

// Загрузка конфигурации пилотирования
const { loadPilotConfig } = require('./scripts/load-pilot-config.cjs');
const PILOT_CONFIG = loadPilotConfig();

// Сохраняем в global для доступа из GameServer
global.PILOT_CONFIG = PILOT_CONFIG;

require('./src/server/GameServer.ts');
