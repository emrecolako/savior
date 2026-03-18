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

# Extract duration - handles both "7.54s" and "392ms" formats
DURATION_LINE=$(echo "$OUTPUT" | grep "Duration")
if echo "$DURATION_LINE" | grep -qE '[0-9]+\.[0-9]+s'; then
  DURATION_S=$(echo "$DURATION_LINE" | grep -oE '[0-9]+\.[0-9]+s' | head -1 | sed 's/s//')
  DURATION_MS=$(echo "$DURATION_S * 1000" | bc | cut -d. -f1)
elif echo "$DURATION_LINE" | grep -qE '[0-9]+ms'; then
  DURATION_MS=$(echo "$DURATION_LINE" | grep -oE '[0-9]+ms' | head -1 | sed 's/ms//')
else
  DURATION_MS=0
fi

# Extract test count
TESTS_LINE=$(echo "$OUTPUT" | grep "Tests")
TEST_COUNT=$(echo "$TESTS_LINE" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+')

echo "METRIC total_ms=$DURATION_MS"
echo "METRIC test_count=$TEST_COUNT"
