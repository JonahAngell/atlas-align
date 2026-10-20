#!/bin/sh
set -eu

# Docker Compose mounts migrations at /atlas-migrations; CI points ATLAS_MIGRATIONS_DIR at .launch/migrations.
for migration in "${ATLAS_MIGRATIONS_DIR:-/atlas-migrations}"/*.sql; do
  [ -f "$migration" ] || continue
  echo "Applying $(basename "$migration")"
  sed '/^-- migrate:down/,$d' "$migration" | psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"
done
