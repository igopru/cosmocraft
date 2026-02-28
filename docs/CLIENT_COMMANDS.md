# CosmoCraft — Команды для клиента

## Сборка клиента
cd ~/project/cosmocraft
npm run build:client
npm run watch:client           # авто-пересборка
rm -rf dist/client/ && npm run build:client  # чистая сборка

## Запуск статического сервера
python3 -m http.server 8001    # из папки public

## Доступные страницы
http://localhost:8001/              # главная игра
http://localhost:8001/designer.html # редактор
http://localhost:8001/simple.html   # тестовая сцена

## Отладка
find public -name "index.html"     # найти index.html
ls -la dist/client/                # проверить сборку
F12 -> Console                     # ошибки в браузере

## Горячая перезагрузка
# Терминал 1: npm run watch:client
# Терминал 2: python3 -m http.server 8001

## Частые проблемы
lsof -i :8001                      # кто занял порт
kill -9 <PID>                      # убить процесс
