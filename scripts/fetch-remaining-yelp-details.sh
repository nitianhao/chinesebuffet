#!/bin/bash
# Script to fetch remaining Yelp business details
# This will fetch attributes and other detailed data for ~3,230 remaining records

cd "$(dirname "$0")/.."

echo "Fetching detailed Yelp data for remaining records..."
echo "This will take approximately 5-10 minutes (3,230 API calls)"
echo ""

PYTHONPATH="/Users/michalpekarcik/Library/Python/3.9/lib/python/site-packages:$PYTHONPATH" \
python3 scripts/get-yelp-business-details.py \
  --api-key "jZAiXhRIXP_6xwgmaOlSwZEdGhVAvpCMEstdWNcpb9q3zVh4Si6qIhDJKWVLJL302PrGoIaqE0zCT9MiRSLq35ysiIoOsW6xhFKd_SilwFXf1KOr4TcFtbwmgF1SaXYx" \
  --batch 50 \
  --delay 0.1 \
  2>&1 | tee yelp-details-progress.log

echo ""
echo "Done! Check yelp-details-progress.log for details"






