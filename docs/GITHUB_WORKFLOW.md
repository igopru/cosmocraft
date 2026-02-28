# CosmoCraft — Git & GitHub шпаргалка

## Ежедневный цикл: работа <-> дом

### УХОДИШЬ С МЕСТА (работа/дом):
cd ~/project/cosmocraft
git status
git add .
git commit -m "WIP: синхронизация перед уходом"
git push origin master

### ПРИХОДИШЬ НА МЕСТО:
cd ~/project/cosmocraft
git fetch origin
git pull origin master
npm install
npm run build

## Работа с ветками
git branch -a                    # все ветки
git checkout -b feature/name     # новая ветка
git checkout develop             # переключиться
git push -u origin feature/name  # отправить ветку

## Конфликты слияния
# 1. Найти маркеры в файле: <<<<<<< HEAD ======= >>>>>>>
# 2. Выбрать нужное, удалить маркеры
# 3. git add файл.ts
# 4. git commit -m "Resolve conflict"

## Отмена изменений
git checkout -- файл.ts          # отменить изменения в файле
git reset --hard HEAD            # отменить все изменения
git reset --soft HEAD~1          # отменить коммит, оставить изменения

## Полезные команды
git log --oneline -5             # последние коммиты
git status -s                    # компактный статус
git diff master..develop         # разница между ветками

## Экстренные ситуации
git reset --hard origin/master   # сброс до версии на GitHub
git clean -fd                    # удалить неигнорируемые файлы

## Чек-лист перед пушем
[ ] npm run build без ошибок
[ ] Клиент грузится в браузере
[ ] Нет node_modules/ dist/ .env в коммите
