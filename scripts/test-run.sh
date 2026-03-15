#!/usr/bin/env bash
set -e

echo "Running Jupiter_Plan integration tests..."

cleanup() {
  bash scripts/test-stop.sh
}
trap cleanup EXIT

bash scripts/test-start.sh

echo "Executing integration test suite..."
(
  cd apps/api
  npm run test:integration
)
