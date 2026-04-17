#!/bin/bash
# Скрипт управления службой cosmocraft
# Использование: ./cosmocraft.sh {start|stop|restart|status}

SERVICE_NAME="cosmocraft"
WORK_DIR="/home/father/project/cosmocraft"
PID_FILE="$WORK_DIR/.cosmocraft.pid"
LOG_FILE="$WORK_DIR/nohup.out"
START_SCRIPT="$WORK_DIR/dist/server/GameServer.js"
NODE="/usr/bin/node"

start() {
    if is_running; then
        echo "🚀 $SERVICE_NAME уже запущен (PID: $(cat $PID_FILE))"
        return 0
    fi

    echo "🚀 Запуск $SERVICE_NAME..."
    cd "$WORK_DIR"
    
    # Запуск в отдельной сессии (setsid) чтобы процесс не умирал
    setsid $NODE $START_SCRIPT > "$LOG_FILE" 2>&1 &
    sleep 4
    
    # Находим PID по процессу
    SERVER_PID=$(pgrep -f "node.*GameServer" | head -1)
    if [ -z "$SERVER_PID" ]; then
        echo "❌ Ошибка запуска $SERVICE_NAME"
        echo "   Последние строки лога:"
        tail -5 "$LOG_FILE" | sed 's/^/   /'
        rm -f "$PID_FILE"
        return 1
    fi
    
    echo "$SERVER_PID" > "$PID_FILE"
    echo "✅ $SERVICE_NAME запущен (PID: $SERVER_PID)"
    echo "   Лог: tail -f $LOG_FILE"
}

stop() {
    PID=$(pgrep -f "node.*GameServer" | head -1)
    if [ -z "$PID" ]; then
        echo "⏹️ $SERVICE_NAME не запущен"
        rm -f "$PID_FILE"
        return 0
    fi

    echo "⏹️ Остановка $SERVICE_NAME (PID: $PID)..."
    kill "$PID" 2>/dev/null
    sleep 3
    
    # Проверяем что процесс действительно остановился
    REMAINING=$(pgrep -f "node.*GameServer" | head -1)
    if [ -n "$REMAINING" ]; then
        echo "⚠️ Принудительная остановка..."
        kill -9 "$REMAINING" 2>/dev/null
        sleep 1
    fi
    rm -f "$PID_FILE"
    echo "✅ $SERVICE_NAME остановлен"
}

restart() {
    stop
    sleep 1
    start
}

status() {
    if is_running; then
        PID=$(cat "$PID_FILE")
        UPTIME=$(ps -o etime= -p $PID 2>/dev/null | xargs)
        MEM=$(ps -o %mem= -p $PID 2>/dev/null | xargs)
        echo "🟢 $SERVICE_NAME запущен"
        echo "   PID:    $PID"
        echo "   Время:  $UPTIME"
        echo "   Память: ${MEM}%"
        echo "   Лог:    tail -f $LOG_FILE"
    else
        echo "🔴 $SERVICE_NAME не запущен"
    fi
}

is_running() {
    # Проверяем PID файл
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            return 0
        fi
    fi
    # Фоллбэк: поиск по процессу
    PID=$(pgrep -f "GameServer" 2>/dev/null | head -1)
    if [ -n "$PID" ]; then
        echo "$PID" > "$PID_FILE"
        return 0
    fi
    return 1
}

case "$1" in
    start)   start ;;
    stop)    stop ;;
    restart) restart ;;
    status)  status ;;
    *)
        echo "Использование: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
