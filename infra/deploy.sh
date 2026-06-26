#!/usr/bin/env bash
# Run from inside the contextbridge repo directory on the EC2 instance.
# Pulls latest code and restarts all services using the prod compose file.
set -euo pipefail

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in real values first."
  exit 1
fi

echo "==> Pulling latest code..."
git pull origin main

echo "==> Building and starting containers..."
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Waiting for DB to be healthy..."
for i in $(seq 1 20); do
  if docker compose -f docker-compose.prod.yml exec -T db pg_isready -U "$(grep POSTGRES_USER .env | cut -d= -f2)" >/dev/null 2>&1; then
    echo "    DB ready."
    break
  fi
  echo "    Waiting... ($i/20)"
  sleep 3
done

echo "==> Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T api alembic upgrade head

echo "==> Deploy complete. Health check..."
sleep 2
curl -sf http://localhost:8000/health && echo " API OK" || echo " WARNING: health check failed — check: docker compose -f docker-compose.prod.yml logs api"
