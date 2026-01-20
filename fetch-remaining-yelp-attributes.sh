#!/bin/bash
# Quick script to fetch remaining Yelp attributes for all records

cd "$(dirname "$0")"

echo "========================================="
echo "Fetching Yelp Attributes for Remaining Records"
echo "========================================="
echo ""
echo "This will process ~3,230 remaining records"
echo "Estimated time: 5-10 minutes"
echo ""

PYTHONPATH="/Users/michalpekarcik/Library/Python/3.9/lib/python/site-packages:$PYTHONPATH" \
python3 scripts/get-yelp-business-details.py \
  --api-key "jZAiXhRIXP_6xwgmaOlSwZEdGhVAvpCMEstdWNcpb9q3zVh4Si6qIhDJKWVLJL302PrGoIaqE0zCT9MiRSLq35ysiIoOsW6xhFKd_SilwFXf1KOr4TcFtbwmgF1SaXYx" \
  --batch 50 \
  --delay 0.1

echo ""
echo "========================================="
echo "Checking final status..."
python3 scripts/monitor-yelp-details-progress.py






