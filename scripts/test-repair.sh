#!/bin/bash

# Quick test script for repair & maintenance POI generation
# Usage: ./scripts/test-repair.sh [limit] [--buffetId <id>]

set -e

# Default to 3 buffets if no argument provided
LIMIT=${1:-3}

echo "=========================================="
echo "Testing Repair & Maintenance Generation"
echo "=========================================="
echo ""

# Check if testing a specific buffet
if [[ "$1" == "--buffetId" ]] || [[ "$1" == "--buffet-id" ]]; then
  BUFFET_ID=$2
  if [ -z "$BUFFET_ID" ]; then
    echo "Error: --buffetId requires a buffet ID"
    exit 1
  fi
  echo "Testing single buffet: $BUFFET_ID"
  echo ""
  npx tsx scripts/generate-poi-repair-maintenance.ts \
    --dry-run \
    --concurrency 1 \
    --buffetId "$BUFFET_ID"
else
  echo "Testing with limit: $LIMIT"
  echo ""
  npx tsx scripts/generate-poi-repair-maintenance.ts \
    --dry-run \
    --concurrency 1 \
    --limit "$LIMIT"
fi

echo ""
echo "=========================================="
echo "Test completed"
echo "=========================================="
