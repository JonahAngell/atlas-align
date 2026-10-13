#!/bin/sh
set -eu

for migration in /atlas-migrations/*.sql; do
  [ -f "$migration" ] || continue
  echo "Applying $(basename "$migration")"
  sed '/^-- migrate:down/,$d' "$migration" | psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"
done
