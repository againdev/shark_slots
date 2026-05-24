#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy from .env.example and fill in secrets."
  exit 1
fi

echo "==> Stack 1/4: PostgreSQL, Redis, Adminer, Backups, Nginx"
docker compose --env-file .env up -d

echo "==> Stack 2/4: Auth (login) :4001"
docker compose -f docker-compose.auth.yml --env-file .env up -d --build

echo "==> Stack 3/4: Slots (Mobule) :4002"
docker compose -f docker-compose.slots.yml --env-file .env up -d --build

echo "==> Stack 4/4: Payments (Crypto Pay) :4003"
docker compose -f docker-compose.payments.yml --env-file .env up -d --build

echo ""
echo "Done. Containers:"
docker ps --filter name=slots- --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo ""
echo "Nginx routes:"
echo "  /auth/*, /api/internal/auth  -> 127.0.0.1:4001 (slots-auth)"
echo "  /mobule/*                    -> 127.0.0.1:4002 (slots-mobule)"
echo "  /api/crypto-bot/*            -> 127.0.0.1:4003 (slots-payments)"
