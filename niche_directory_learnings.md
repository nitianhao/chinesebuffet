# Niche Directory Performance: Precomputed Rollups Strategy

## The Problem

In programmatic SEO directories with thousands of pages, hub/index pages need to display aggregated data:
- States index: count of buffets per state
- Cities index: count of buffets per city  
- City page: list of all buffets in that city
- Neighborhood page: list of all buffets in that neighborhood

**Why live aggregation fails at scale:**

1. **No server-side aggregation**: Many modern databases (InstantDB, Firebase, Supabase realtime) don't support SQL-style `GROUP BY` on the server
2. **Full record fetching**: Some DBs return ALL fields for each record, even if you only need 2 fields
3. **Nested expansions are expensive**: Queries like `buffets { city { slug } }` expand relations, multiplying data size
4. **JSON response limits**: Large responses can exceed Node.js string limits (~512MB)
5. **Request-time latency**: Users experience 10-15s load times while aggregation runs

## The Solution: Precomputed Rollups

Instead of computing aggregations on each request, precompute them offline and store the results.

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Rebuild Script │────▶│ directoryRollups │────▶│   Hub Pages     │
│  (offline/cron) │     │     (table)      │     │  (fast reads)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Rollup Table Schema

```typescript
directoryRollups: {
  id: string,           // e.g., "rollup-states" or "rollup-cityBuffets-new-york-ny"
  type: string,         // "states" | "cities" | "cityBuffets" | etc.
  key: string | null,   // null for global, or specific key like "ny" or "new-york-ny"
  data: string,         // JSON stringified array of rollup rows
  updatedAt: string,    // ISO timestamp
  buffetCount: number,  // Quick sanity check field
}
```

### Rollup Types for a Directory

| Type | Key | Data Format | Used By |
|------|-----|-------------|---------|
| `states` | null | `[{ stateAbbr, stateName, buffetCount, cityCount }]` | States index hub |
| `cities` | null | `[{ citySlug, cityName, stateAbbr, buffetCount }]` | Cities index hub |
| `stateCities` | stateAbbr | `[{ citySlug, cityName, buffetCount }]` | State detail page |
| `cityBuffets` | citySlug | `[{ id, slug, name, rating, ... }]` | City detail page |
| `cityNeighborhoods` | citySlug | `[{ neighborhoodSlug, name, buffetCount }]` | City neighborhoods hub |
| `neighborhoodBuffets` | citySlug/neighborhoodSlug | `[{ id, slug, name, ... }]` | Neighborhood detail page |

## Implementation Guide

### Step 1: Add Rollup Storage

Add a table/entity to your database for storing rollups:

```typescript
// InstantDB schema example
directoryRollups: i.entity({
  type: i.string().indexed(),
  key: i.string().optional().indexed(),
  data: i.string(),
  updatedAt: i.string().indexed(),
  buffetCount: i.number().optional(),
}),
```

### Step 2: Create Rollup Reader (Server-Only)

```typescript
// lib/rollups.ts
import { cache } from 'react';

export type RollupType = 'states' | 'cities' | 'stateCities' | 'cityBuffets' | ...;

export const getRollup = cache(async (type: RollupType, key?: string) => {
  const rollupId = key ? `rollup-${type}-${key}` : `rollup-${type}`;
  
  const result = await db.query({
    directoryRollups: {
      $: { where: { id: rollupId } }
    }
  });
  
  const record = result.directoryRollups?.[0];
  
  if (!record) {
    return { found: false, data: null, updatedAt: null, stale: true };
  }
  
  const data = JSON.parse(record.data);
  const updatedAt = record.updatedAt;
  const hoursSinceUpdate = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60);
  
  return {
    found: true,
    data,
    updatedAt,
    stale: hoursSinceUpdate > 24, // Consider stale after 24h
  };
});
```

### Step 3: Create Rebuild Script

**Critical: Avoid fetching full records!**

```javascript
// scripts/rebuildRollups.js
const { init } = require('@instantdb/admin');

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANTDB_APP_ID,
  adminToken: process.env.INSTANTDB_ADMIN_TOKEN,
});

// WRONG: Fetches all fields including huge JSON blobs
const badQuery = await db.query({ buffets: {} });

// BETTER: Paginate and extract minimal fields immediately
async function fetchMinimalBuffets() {
  const BATCH_SIZE = 30; // Small batches to avoid memory issues
  const allBuffets = [];
  
  for (const stateAbbr of STATE_CODES) {
    let offset = 0;
    
    while (true) {
      const result = await db.query({
        buffets: {
          $: { where: { stateAbbr }, limit: BATCH_SIZE, offset }
        }
      });
      
      const batch = result.buffets || [];
      if (batch.length === 0) break;
      
      // Extract ONLY needed fields immediately to free memory
      for (const b of batch) {
        allBuffets.push({
          id: b.id,
          slug: b.slug,
          name: b.name,
          stateAbbr: b.stateAbbr,
          cityName: b.city, // Use denormalized field
          neighborhood: b.neighborhood,
          rating: b.rating,
          // DO NOT include: images, reviews, menuItems, etc.
        });
      }
      
      if (batch.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }
  }
  
  return allBuffets;
}
```

### Step 4: Build Rollup Data

```javascript
function buildStatesRollup(buffets) {
  const stateMap = new Map();
  
  for (const b of buffets) {
    if (!b.stateAbbr) continue;
    
    if (!stateMap.has(b.stateAbbr)) {
      stateMap.set(b.stateAbbr, { 
        stateAbbr: b.stateAbbr,
        stateName: STATE_NAMES[b.stateAbbr] || b.stateAbbr,
        buffetCount: 0,
        cities: new Set()
      });
    }
    
    const state = stateMap.get(b.stateAbbr);
    state.buffetCount++;
    if (b.citySlug) state.cities.add(b.citySlug);
  }
  
  return Array.from(stateMap.values())
    .map(s => ({
      stateAbbr: s.stateAbbr,
      stateName: s.stateName,
      buffetCount: s.buffetCount,
      cityCount: s.cities.size,
    }))
    .sort((a, b) => b.buffetCount - a.buffetCount);
}
```

### Step 5: Save Rollups

```javascript
async function saveRollup(type, key, data) {
  const rollupId = key ? `rollup-${type}-${key}` : `rollup-${type}`;
  
  // Delete existing
  const existing = await db.query({
    directoryRollups: { $: { where: { id: rollupId } } }
  });
  
  if (existing.directoryRollups?.length > 0) {
    await db.transact(
      existing.directoryRollups.map(r => db.tx.directoryRollups[r.id].delete())
    );
  }
  
  // Insert new
  await db.transact(
    db.tx.directoryRollups[rollupId].update({
      type,
      key: key || null,
      data: JSON.stringify(data),
      updatedAt: new Date().toISOString(),
      buffetCount: calculateCount(data),
    })
  );
}
```

### Step 6: Use Rollups in Pages

```typescript
// app/chinese-buffets/states/page.tsx
import { getStatesRollup } from '@/lib/rollups';

export const revalidate = 43200; // 12 hours

export default async function StatesPage() {
  const { data, debug } = await getStatesRollup();
  
  if (!data || data.states.length === 0) {
    if (process.env.NODE_ENV !== 'production') {
      return <div>Rollup missing. Run: node scripts/rebuildRollups.js</div>;
    }
    notFound();
  }
  
  return (
    <div>
      <h1>Chinese Buffets by State</h1>
      {data.states.map(state => (
        <Link key={state.stateAbbr} href={`/chinese-buffets/states/${state.stateAbbr.toLowerCase()}`}>
          {state.stateName} ({state.buffetCount} buffets)
        </Link>
      ))}
      
      {process.env.NODE_ENV !== 'production' && <DebugPanel debug={debug} />}
    </div>
  );
}
```

## Best Practices

### 1. Denormalize Early

Store frequently-accessed fields directly on the main entity:

```typescript
// Instead of: buffet.city.slug, buffet.city.state
// Store: buffet.citySlug, buffet.stateAbbr, buffet.cityName
```

This avoids expensive relation expansions during rollup builds.

### 2. Paginate Aggressively

Many DBs return all fields for each record. Fetch in small batches (30-50) and immediately extract only needed fields to avoid memory issues.

### 3. Use Appropriate Revalidation

| Page Type | Revalidate | Reason |
|-----------|------------|--------|
| Hub pages (states, cities) | 12-24h | Rarely changes |
| Detail pages (city, state) | 6-12h | Moderate changes |
| Item pages (buffet) | 1-6h | May have reviews/updates |

### 4. Add Debug Panels (Dev Only)

Always show rollup status in development:
- Rollup hit/miss
- Last updated timestamp
- Data row count
- Fetch duration

### 5. Graceful Degradation

- In dev: Show helpful "Run rebuildRollups" message
- In prod: Show 404 or empty state, never block on rebuild

### 6. Schedule Rebuilds

```bash
# Cron job example (rebuild daily at 3 AM)
0 3 * * * cd /path/to/project && node scripts/rebuildRollups.js >> /var/log/rollups.log 2>&1
```

Or use a CI/CD pipeline trigger after data imports.

## When to Use This Pattern

**Use rollups when:**
- Hub pages aggregate data across many records (>100)
- DB doesn't support server-side GROUP BY
- DB returns full records (no field projection)
- Aggregation takes >1s at request time
- Data changes infrequently (hourly or less)

**Skip rollups when:**
- Small dataset (<100 records total)
- DB has efficient aggregation (Postgres, MySQL)
- Data changes in real-time and must be fresh
- Simple key-value lookups (use direct queries)

## Common Pitfalls

1. **Fetching too much data**: Always paginate and extract minimal fields
2. **Forgetting to rebuild**: Set up automated rebuilds after data imports
3. **Stale detection**: Track `updatedAt` and warn if rollups are old
4. **Memory limits**: Node.js has ~512MB string limit; batch operations
5. **Missing indexes**: Add indexes on `type` and `key` fields in rollup table

## Performance Expectations

| Operation | Before Rollups | After Rollups |
|-----------|---------------|---------------|
| States hub page | 10-15s timeout | <100ms |
| City detail page | 5-10s | <200ms |
| Neighborhood page | 3-5s | <150ms |
| Full rollup rebuild | N/A | 15-30min (one-time) |

## Fast Search Blueprint (InstantDB + Next.js App Router)

This is a reusable, production-friendly pattern for building a fast, prefix-based search with InstantDB and Next.js App Router. It keeps queries index-friendly, minimizes payload size, and adds caching at the client and server.

### 1. Schema: add normalized search fields

Add `searchName` (indexed) to the entities you want to search. Keep it optional during backfill.

```typescript
// instant.schema.ts
cities: i.entity({
  city: i.string().indexed(),
  stateAbbr: i.string().indexed(),
  slug: i.string().unique().indexed(),
  searchName: i.string().indexed().optional(),
  // ...
}),
buffets: i.entity({
  name: i.string().indexed(),
  slug: i.string().indexed(),
  searchName: i.string().indexed().optional(),
  // ...
}),
```

### 2. Normalization: one source of truth

Create a single normalization function and reuse it in:
- ingest/import scripts
- backfill script
- search API

Rules:
- lowercase
- trim
- replace non `[a-z0-9]` with spaces
- collapse spaces to single space

```typescript
export function normalizeForIndex(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

### 3. Backfill script (one-time, idempotent)

Read existing records, compute `searchName`, and update only when different.

```javascript
const normalized = normalizeForIndex(buffet.name);
if (buffet.searchName !== normalized) {
  db.tx.buffets[buffet.id].update({ searchName: normalized });
}
```

### 4. Ingest/update path

Any time you create or update a record:
- set `searchName = normalizeForIndex(name)`

### 5. Search API: prefix query + minimal payload

Use prefix matching on the indexed field. Keep the response small.

```typescript
const qn = normalizeForIndex(q);
if (qn.length < 2) return [];

// Prefix match
where: { searchName: { $like: `${qn}%` } }

// Return minimal fields only
return { id, name, slug, city, state, rating, reviewCount, thumbUrl };
```

### 6. Caching layers (fast to slow)

1. Client in-memory LRU cache (60s TTL)
2. Server in-memory cache (60s TTL)
3. CDN caching (Cache-Control s-maxage)

Recommended headers:

```
Cache-Control: public, s-maxage=60, stale-while-revalidate=300
```

### 7. UI: debounce, abort, suggestions

Client-side rules:
- debounce input (200ms)
- abort previous request when new query starts
- only fetch when query length >= 2
- render results as soon as they arrive

Optional polish:
- suggestions endpoint for empty input
- prefetch top 1-2 popular queries into client cache

### 8. Dedupe + ranking (in memory)

Fetch a small candidate pool (limit * 5, cap 50), then:
- dedupe by `name + citySlug` (or `name + city/state`)
- score and sort in JS
- return top `limit`

### 9. Debug checklist

When results are empty:
- verify `searchName` exists in DB (debug endpoint)
- verify `normalizeForIndex` matches the backfill logic
- ensure search field is indexed
- confirm query length >= 2

This blueprint keeps search fast (prefix index scans), cheap (small payloads), and easy to reason about (single normalization function).

## Summary

Precomputed rollups transform slow, expensive aggregation queries into fast key-value lookups. The trade-off is data staleness (minutes to hours) vs. request-time performance. For most directory sites where data changes daily or less frequently, this is an excellent trade-off that dramatically improves user experience and SEO (faster pages = better Core Web Vitals).
