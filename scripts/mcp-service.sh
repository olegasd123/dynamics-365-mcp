#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE="$ROOT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

ACTION=${1:-}
PORT=${2:-${MCP_PORT:-3003}}
CONFIG_PATH=${3:-${D365_MCP_CONFIG:-}}

HOST=${MCP_HOST:-127.0.0.1}
MCP_HTTP_PATH=${MCP_PATH:-/mcp}
NODE_BIN=${NODE_BIN:-node}

RUN_DIR="$ROOT_DIR/run"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$RUN_DIR/dynamics-365-mcp-$PORT.pid"
LOG_FILE="$LOG_DIR/dynamics-365-mcp-$PORT.log"
ENTRY_FILE="$ROOT_DIR/dist/index.js"
HEALTH_URL="http://$HOST:$PORT/health"

usage() {
  echo "Usage: $0 {start|stop|restart|status} [port] [config-path]"
  exit 1
}

ensure_dirs() {
  mkdir -p "$RUN_DIR" "$LOG_DIR"
}

read_pid() {
  if [ -f "$PID_FILE" ]; then
    cat "$PID_FILE"
  fi
}

is_running() {
  PID=$(read_pid)
  if [ -z "${PID:-}" ]; then
    return 1
  fi

  kill -0 "$PID" 2>/dev/null
}

wait_for_health() {
  if command -v curl >/dev/null 2>&1; then
    ATTEMPT=0
    while [ "$ATTEMPT" -lt 20 ]; do
      if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
        return 0
      fi

      ATTEMPT=$((ATTEMPT + 1))
      sleep 1
    done

    return 1
  fi

  sleep 2
  is_running
}

start_service() {
  ensure_dirs

  if [ ! -f "$ENTRY_FILE" ]; then
    echo "Build file not found: $ENTRY_FILE"
    echo "Run 'npm run build' first."
    return 1
  fi

  if is_running; then
    PID=$(read_pid)
    echo "Dynamics 365 MCP is already running on port $PORT (PID $PID)."
    return 0
  fi

  rm -f "$PID_FILE"

  (
    cd "$ROOT_DIR"

    export MCP_TRANSPORT=http
    export MCP_PORT="$PORT"
    export MCP_HOST="$HOST"
    export MCP_PATH="$MCP_HTTP_PATH"

    if [ -n "$CONFIG_PATH" ]; then
      export D365_MCP_CONFIG="$CONFIG_PATH"
    fi

    nohup "$NODE_BIN" "$ENTRY_FILE" >>"$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
  )

  if wait_for_health; then
    PID=$(read_pid)
    echo "Dynamics 365 MCP started on http://$HOST:$PORT$MCP_HTTP_PATH (PID $PID)."
    echo "Health: $HEALTH_URL"
    echo "Log: $LOG_FILE"
    return 0
  fi

  echo "Dynamics 365 MCP failed to start. Check $LOG_FILE"
  if is_running; then
    PID=$(read_pid)
    kill "$PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  return 1
}

stop_service() {
  if ! is_running; then
    echo "Dynamics 365 MCP is not running on port $PORT."
    rm -f "$PID_FILE"
    return 0
  fi

  PID=$(read_pid)
  kill "$PID" 2>/dev/null || true

  ATTEMPT=0
  while [ "$ATTEMPT" -lt 20 ]; do
    if ! kill -0 "$PID" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "Dynamics 365 MCP stopped on port $PORT."
      return 0
    fi

    ATTEMPT=$((ATTEMPT + 1))
    sleep 1
  done

  kill -9 "$PID" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "Dynamics 365 MCP force stopped on port $PORT."
  return 0
}

status_service() {
  if is_running; then
    PID=$(read_pid)
    echo "Dynamics 365 MCP is running on port $PORT (PID $PID)."
    echo "Health: $HEALTH_URL"
    return 0
  fi

  echo "Dynamics 365 MCP is not running on port $PORT."
  return 1
}

case "$ACTION" in
  start)
    start_service
    ;;
  stop)
    stop_service
    ;;
  restart)
    stop_service
    start_service
    ;;
  status)
    status_service
    ;;
  *)
    usage
    ;;
esac
