#!/bin/bash
set -euo pipefail

# Pre-check: TypeScript compilation
npx tsc --noEmit 2>&1 | tail -5
if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo "METRIC total_ms=0"
  echo "METRIC test_count=0"
  exit 1
fi

# Run tests and capture timing
OUTPUT=$(npx vitest run 2>&1)
echo "$OUTPUT" | tail -20

# Extract duration in ms
DURATION_LINE=$(echo "$OUTPUT" | grep "Duration")
# Duration format: "Duration  7.55s (transform ...)"
DURATION_S=$(echo "$DURATION_LINE" | grep -oE '[0-9]+\.[0-9]+s' | head -1 | sed 's/s//')
DURATION_MS=$(echo "$DURATION_S * 1000" | bc | cut -d. -f1)

# Extract test count
TESTS_LINE=$(echo "$OUTPUT" | grep "Tests")
TEST_COUNT=$(echo "$TESTS_LINE" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+')

echo "METRIC total_ms=$DURATION_MS"
echo "METRIC test_count=$TEST_COUNT"
