#!/bin/sh
set -e

echo "Waiting for database..."
until psql "$DATABASE_URL" -c '\q' 2>/dev/null; do
  sleep 2
done
echo "Database ready."

echo "Running migrations..."
psql "$DATABASE_URL" -f ./migrations/001_initial.sql 2>&1 || true
echo "Migrations done."

exec ./api
