# CosmoCraft — Команды для сервера

## Настройка npm
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
hash -r                            # очистить кэш команд

## Если таймауты при install
npm config set fetch-timeout 600000
npm config set registry https://registry.npmmirror.com
npm cache clean --force

## Зависимости и сборка
cd ~/project/cosmocraft
npm install
npm run build                      # всё
npm run build:server               # только сервер
npm run build:client               # только клиент
rm -rf dist/                       # очистить сборку

## Запуск сервера
npm run dev                        # разработка (nodemon)
npm start                          # продакшен
lsof -i :3000                      # проверить порт
kill -9 $(lsof -t -i:3000)         # убить процесс на порту

## Диагностика
npm config list                    # конфиг npm
npm run                            # доступные скрипты
ls -la .env                        # проверить .env
