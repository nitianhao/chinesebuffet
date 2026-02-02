# Test Scripts for Repair & Maintenance POI Generation

## Quick Test (Recommended)

```bash
# Test with 3 buffets (default)
./scripts/test-repair.sh

# Test with custom limit
./scripts/test-repair.sh 5

# Test with 10 buffets
./scripts/test-repair.sh 10

# Test a specific buffet
./scripts/test-repair.sh --buffetId <buffet-id>
```

## Alternative Test Methods

### TypeScript Test Script
```bash
# Test with default (3 buffets)
npx tsx scripts/test-repair-maintenance.ts

# Test with custom limit
npx tsx scripts/test-repair-maintenance.ts --limit 5

# Test a specific buffet
npx tsx scripts/test-repair-maintenance.ts --buffetId <buffet-id>
```

### Direct Command
```bash
# Test single buffet
npx tsx scripts/generate-poi-repair-maintenance.ts --buffetId <id> --dry-run

# Test 3 buffets
npx tsx scripts/generate-poi-repair-maintenance.ts --dry-run --limit 3 --concurrency 1

# Test 10 buffets
npx tsx scripts/generate-poi-repair-maintenance.ts --dry-run --limit 10 --concurrency 1
```

## What to Check

When testing, verify:
- ✅ Output is exactly one paragraph (no headings, bullets, blank lines)
- ✅ Length is 110-170 words
- ✅ Mentions 2-5 POIs with distances in miles
- ✅ Includes: "repair", "maintenance", "nearby", "close to the buffet"
- ✅ No phone numbers
- ✅ No city/state names
- ✅ No generic services (only concrete POIs)
- ✅ Each POI has distance + at most one detail (address OR hours OR website)
- ✅ No superlatives or review language

## Example Output

```
================================================================================
BUFFET: Hongkong Garden (0b026e41-c0a9-4d8e-bfaa-0804ead5afcd)
STATUS: GENERATED
POI COUNT: 5
TOKENS: prompt=773 | completion=154 | total=927
--------------------------------------------------------------------------------
WORD COUNT: 94
--------------------------------------------------------------------------------
[Generated paragraph text here]
================================================================================
```
