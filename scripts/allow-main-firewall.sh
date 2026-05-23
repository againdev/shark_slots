#!/bin/sh
# Запуск на сервере slots (178.250.156.62): разрешить :4001 только с main
set -e
MAIN_IP=157.22.192.247
PORT=4001

if command -v ufw >/dev/null 2>&1; then
  ufw allow from "$MAIN_IP" to any port "$PORT" proto tcp comment 'hiroll main'
  ufw status | grep -E "$MAIN_IP|$PORT" || true
  echo "OK: ufw allow from $MAIN_IP to port $PORT"
else
  echo "ufw not found — добавьте правило вручную для $MAIN_IP -> $PORT"
  exit 1
fi
