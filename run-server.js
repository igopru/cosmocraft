// run-server.js
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

// Обработка ошибок
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});

require('./src/server/GameServer.ts');

console.log('✅ Server module loaded, keeping process alive...');

// Удерживаем процесс активным
setInterval(() => {
  // Пустой интервал для удержания процесса
}, 60000);
