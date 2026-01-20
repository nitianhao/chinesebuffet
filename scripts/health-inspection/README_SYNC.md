# Health Inspection Data Sync

## Current Status
✓ Health inspection data has been added to JSON files (3 buffets)
✓ Schema file updated with healthInspection field
⚠ Schema needs to be synced to InstantDB

## To Complete the Sync:

### Option 1: Auto-sync (Recommended)
1. Start your Next.js dev server:
   ```bash
   npm run dev
   ```
2. Wait for the app to initialize (this syncs the schema automatically)
3. In another terminal, run:
   ```bash
   node scripts/health-inspection/sync-health-data-to-db.js
   ```

### Option 2: Manual CLI Sync
1. Login to InstantDB CLI:
   ```bash
   npx instant-cli login
   ```
2. Push schema:
   ```bash
   npx instant-cli push
   ```
3. Run sync:
   ```bash
   node scripts/health-inspection/sync-health-data-to-db.js
   ```

## Test URLs (once synced):
- http://localhost:3000/chinese-buffets/vacaville-ca/kings-buffet
- http://localhost:3000/chinese-buffets/fishers-in/dragon-house-chinese-eatery
- http://localhost:3000/chinese-buffets/indianapolis-in/super-china-buffet
