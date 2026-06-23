#!/usr/bin/env bash
# Dumps the Postgres database to a local timestamped file and keeps the last 7.
# Set up as a daily cron job on the EC2 instance (see infra/README.md).
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="$HOME/contextbridge_backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/contextbridge_$TIMESTAMP.sql.gz"

docker compose -f docker-compose.prod.yml exec -T db pg_dump -U contextbridge contextbridge | gzip > "$FILE"

echo "Backup written to $FILE"

# Keep only the 7 most recent backups
ls -1t "$BACKUP_DIR"/contextbridge_*.sql.gz | tail -n +8 | xargs -r rm --
