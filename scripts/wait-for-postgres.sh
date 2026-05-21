#!/bin/sh
set -e

host="${POSTGRES_HOST:-slots-postgres}"
port="${POSTGRES_PORT:-5432}"

echo "Waiting for PostgreSQL at ${host}:${port}..."
until nc -z -w5 "$host" "$port"; do
  sleep 2
done
echo "PostgreSQL is up."
