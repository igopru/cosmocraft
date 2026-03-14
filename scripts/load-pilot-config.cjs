// scripts/load-pilot-config.cjs
// Скрипт для загрузки конфигурации .pilotenv и передачи её на клиент

const fs = require('fs');
const path = require('path');

function loadPilotConfig() {
    const pilotEnvPath = path.join(__dirname, '..', '.pilotenv');
    
    if (!fs.existsSync(pilotEnvPath)) {
        console.log('⚠️  .pilotenv не найден, используются значения по умолчанию');
        return {};
    }
    
    const content = fs.readFileSync(pilotEnvPath, 'utf-8');
    const config = {};
    
    content.split('\n').forEach(line => {
        line = line.trim();
        
        // Пропускаем комментарии и пустые строки
        if (!line || line.startsWith('#')) return;
        
        const [key, value] = line.split('=');
        if (key && value) {
            const trimmedKey = key.trim();
            const trimmedValue = value.trim();
            
            // Преобразуем значения
            if (trimmedValue === 'true') {
                config[trimmedKey] = true;
            } else if (trimmedValue === 'false') {
                config[trimmedKey] = false;
            } else if (!isNaN(trimmedValue)) {
                config[trimmedKey] = parseFloat(trimmedValue);
            } else {
                config[trimmedKey] = trimmedValue;
            }
        }
    });
    
    console.log('✅ Загружена конфигурация пилотирования:', config);
    return config;
}

// Экспорт для использования в server.js
module.exports = { loadPilotConfig };

// Если запущен напрямую
if (require.main === module) {
    const config = loadPilotConfig();
    console.log('\n📊 Конфигурация для window.PILOT_CONFIG:');
    console.log(JSON.stringify(config, null, 2));
}
