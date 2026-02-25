#!/bin/bash

# Настройки
PROJECT_DIR=~/project/cosmocraft
BACKUP_DIR=$PROJECT_DIR/backups
DB_NAME=cosmocraft
DB_USER=prusakoviv
KEEP_DAYS=7  # хранить 7 дней

# Цвета для вывода
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Создаём папку для бэкапов
mkdir -p $BACKUP_DIR

# Генерируем имя файла с датой
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE=$BACKUP_DIR/${DB_NAME}_$TIMESTAMP.sql
BACKUP_GZ=$BACKUP_FILE.gz

echo -e "${YELLOW}📦 Creating backup of database $DB_NAME...${NC}"

# Создаём дамп и сразу сжимаем
mysqldump -u $DB_USER -p --databases $DB_NAME --no-tablespaces --routines --triggers --events | gzip > $BACKUP_GZ

# Проверяем успешность
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Backup created successfully: $BACKUP_GZ${NC}"
  echo -e "${GREEN}📊 Size: $(du -h $BACKUP_GZ | cut -f1)${NC}"
  
  # Удаляем старые бэкапы
  echo -e "${YELLOW}🧹 Removing backups older than $KEEP_DAYS days...${NC}"
  find $BACKUP_DIR -name "${DB_NAME}_*.sql.gz" -type f -mtime +$KEEP_DAYS -delete
  
  # Считаем количество оставшихся бэкапов
  BACKUP_COUNT=$(find $BACKUP_DIR -name "${DB_NAME}_*.sql.gz" -type f | wc -l)
  echo -e "${GREEN}📚 Total backups: $BACKUP_COUNT${NC}"
else
  echo -e "${RED}❌ Error creating backup!${NC}"
  exit 1
fi
