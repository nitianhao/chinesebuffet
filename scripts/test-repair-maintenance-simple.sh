#!/bin/bash

# Simple test script for repair & maintenance POI generation
# Usage:
#   ./scripts/test-repair-maintenance-simple.sh
#   ./scripts/test-repair-maintenance-simple.sh 5
#   ./scripts/test-repair-maintenance-simple.sh --buffetId <id>

set -e

LIMIT=${1:-3}

echo "=========================================="
echo "Testing Repair & Maintenance Generation"
echo "=========================================="
echo ""

if [[ "$1" == "--buffetId" ]] || [[ "$1" == "--buffet-id" ]]; then
  BUFFET_ID=$2
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
