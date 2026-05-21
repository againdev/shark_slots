#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy from .env.example and fill in secrets."
  exit 1
fi

echo "==> Stack 1/2: PostgreSQL, Redis, Adminer, Backups, Nginx"
docker compose --env-file .env up -d

echo "==> Stack 2/2: Backend (build + start)"
docker compose -f docker-compose.backend.yml --env-file .env up -d --build

echo ""
echo "Done. Containers:"
docker ps --filter name=slots- --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo ""
echo "Nginx on the host should proxy :4001 (backend)"
