#!/usr/bin/env bash
set -e

echo "Stopping Jupiter_Plan test environment..."

if docker compose version > /dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose > /dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  echo "docker compose or docker-compose is required."
  exit 1
fi

${DOCKER_COMPOSE_CMD} -f docker-compose.test.yml down -v

echo "Test containers stopped and volumes removed."
