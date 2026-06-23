#!/usr/bin/env bash
# Run from inside the contextbridge repo directory on the EC2 instance.
# Pulls latest code and (re)starts all services with the production compose file.
set -euo pipefail

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.prod.example to .env and fill in real values first."
  exit 1
fi

echo "Pulling latest code..."
git pull origin main

echo "Building and starting containers..."
docker compose -f docker-compose.prod.yml up -d --build

echo "Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T api alembic upgrade head

echo "Deploy complete. Checking health..."
sleep 3
curl -sf http://localhost:8000/health && echo " - OK" || echo " - HEALTH CHECK FAILED, check: docker compose -f docker-compose.prod.yml logs api"
