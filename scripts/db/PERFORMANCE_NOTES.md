# Database Performance Notes

## Database Type
This project uses **InstantDB** - a cloud-native database that handles indexing automatically.
Traditional SQL indexes (CREATE INDEX) are not applicable here.

## Current Architecture: Precomputed Rollups (January 2026)

Hub pages now use **precomputed rollups** stored in the `directoryRollups` table.
This eliminates expensive aggregation queries on every page request.

### How It Works

1. **Rollups are precomputed** by running:
   ```bash
   node scripts/rebuildRollups.js
   ```

2. **Rollups are stored** in the `directoryRollups` table with:
   - `type`: "states" | "cities" | "cityNeighborhoods"
   - `key`: null for global, citySlug for neighborhoods
   - `data`: JSON array of aggregated rows
   - `updatedAt`: ISO timestamp

3. **Hub pages read rollups** via simple queries:
   ```typescript
   db.query({ directoryRollups: { $: { where: { type: 'states' } } } })
   ```

4. **ISR caching** with `export const revalidate = 21600` (6 hours)

### Key Files

- `lib/rollups.ts` - Rollup reader with React cache()
- `scripts/rebuildRollups.js` - Rebuild script
- `src/instant.schema.ts` - Schema with directoryRollups entity

### Performance

| Scenario | Time |
|----------|------|
| Rollup read (cached) | < 50ms |
| Rollup read (uncached) | ~200-500ms |
| Full rebuild (all rollups) | ~28 minutes |

### Rollup Types

| Type | Key | Description |
|------|-----|-------------|
| `states` | null | States hub index |
| `cities` | null | Cities hub index |
| `cityNeighborhoods` | citySlug | Neighborhoods for a city |
| `stateCities` | stateAbbr (lowercase) | Cities in a state |
| `cityBuffets` | citySlug | Buffets in a city |
| `neighborhoodBuffets` | citySlug/neighborhoodSlug | Buffets in a neighborhood |

### Rollup Rebuild Schedule

Rollups should be rebuilt:
- After bulk data imports
- Daily via cron job (recommended)
- Manually when data changes significantly

## Previous Architectures (Historical)

### v2: unstable_cache + Minimal Fields (Still Slow)
- Used `unstable_cache` for caching
- Queried `buffets { stateAbbr, city { slug } }` 
- Still timed out at 15s due to nested relation expansion

### v1: Full Table Scan (Very Slow)
- Fetched ALL buffets with ALL fields
- Grouped in memory
- ~15s load times

## Why It's Slow

1. **Full table scan**: Fetching all buffets to group them
2. **Cold cache**: First request after server restart fetches everything
3. **Network latency**: InstantDB is cloud-based; roundtrip matters
4. **Memory processing**: Grouping thousands of records in JS

## Optimizations Applied

### 1. Request-level caching (10 min TTL)
```typescript
// In data-instantdb.ts
const CACHE_TTL = 600000; // 10 minutes
let requestCache = { cities, buffets, timestamp };
```

### 2. Timeout handling
Hub page queries now have timeouts:
- Development: 3 seconds
- Production: 8 seconds

### 3. Debug instrumentation
Pages show debug panels when:
- Results are empty
- Query times out
- Query takes > 2 seconds

## Potential Future Optimizations

### Option A: Pre-computed aggregates table
Create a `state_counts` table in InstantDB with pre-computed counts:
```
id | stateAbbr | buffetCount | cityCount | lastUpdated
```
Update via background job when buffets change.

### Option B: Server-side caching layer
Add Redis/Upstash caching for aggregates:
```typescript
const cachedStates = await redis.get('hub:states');
if (cachedStates) return JSON.parse(cachedStates);
```

### Option C: ISR (Incremental Static Regeneration)
Pre-render hub pages at build time and revalidate periodically:
```typescript
export const revalidate = 3600; // Revalidate every hour
```

### Option D: Client-side data loading
Load page shell immediately, fetch data client-side:
```typescript
// Show skeleton while loading
const { data, isLoading } = useSWR('/api/states');
```

## InstantDB Query Optimization Tips

InstantDB performs best when:
1. Using specific queries with `where` clauses
2. Limiting result sets with `limit`
3. Avoiding N+1 patterns (use `city: {}` to include relations)

Current optimized query:
```typescript
db.query({
  buffets: {
    $: { limit: 10000 },
    city: {}
  }
});
```

## Monitoring

Check these console logs to diagnose issues:
```
[Hub] getAllStatesWithCounts: 52ms
[data-instantdb] getBuffetsByState: 45 states with buffets
[data-instantdb] Using cached data: 500 cities, 3200 buffets
```

If you see:
- `TIMED OUT` - Check INSTANT_ADMIN_TOKEN and network connectivity
- `0 states` - Check if buffets have stateAbbr field populated
- Duration > 5000ms - Cache is cold, first request after restart
