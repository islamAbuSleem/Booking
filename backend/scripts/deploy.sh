#!/bin/sh
set -e

echo "Resolving baseline migration for existing databases..."
npx prisma migrate resolve --applied 20260901000000_baseline || true

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Done."
