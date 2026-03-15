#!/usr/bin/env bash
set -e

echo "Starting Jupiter_Plan test environment..."

if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running. Start Docker and retry."
  exit 1
fi

if [ ! -f "apps/api/.env.test" ]; then
  echo "Missing apps/api/.env.test"
  echo "Copy .env.test.example to apps/api/.env.test and configure it."
  exit 1
fi

if docker compose version > /dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose > /dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  echo "docker compose or docker-compose is required."
  exit 1
fi

${DOCKER_COMPOSE_CMD} -f docker-compose.test.yml up -d

echo "Waiting for PostgreSQL test health..."
until docker inspect jupiter_postgres_test --format='{{.State.Health.Status}}' | grep -q "healthy"; do
  sleep 2
done
echo "PostgreSQL test ready on 5433"

echo "Waiting for Redis test health..."
until docker inspect jupiter_redis_test --format='{{.State.Health.Status}}' | grep -q "healthy"; do
  sleep 2
done
echo "Redis test ready on 6380"

echo "Applying Prisma migrations on test DB..."
set -a
# shellcheck disable=SC1091
source apps/api/.env.test
set +a
(
  cd apps/api
  npx prisma migrate deploy
)

echo "Test environment ready."
