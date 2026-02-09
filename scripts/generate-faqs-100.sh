#!/bin/bash
# Generate FAQs for first 100 buffets and write to database
# Usage: ./scripts/generate-faqs-100.sh

cd "$(dirname "$0")/.." || exit 1
npx tsx scripts/generate-faqs-from-reviews.ts --limit 100 --write
