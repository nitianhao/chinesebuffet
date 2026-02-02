# POI Description Generation Script Guide

This guide explains the architecture and mechanics of POI description generation scripts. There are two approaches: **deterministic JSON format** and **LLM-based plain text format**. Use this as a reference when creating similar scripts for other POI groups.

## Overview

### Format 1: Deterministic JSON (Template-Based)
- **No LLM calls** - Uses template-based string generation
- **Output**: JSON object with `summary` and `highlights` array
- **Always valid output** - Templates guarantee word count, sentence count, and format compliance
- **Fast execution** - No API rate limits or retries needed
- **Cost-free** - No token usage
- **Example**: `generate-poi-travel-tourism.ts`

### Format 2: LLM-Based Plain Text (API-Based)
- **Uses LLM** - Groq API for natural language generation
- **Output**: Single plain text paragraph (80-150 words)
- **SEO-optimized** - Natural, readable text with keyword enforcement
- **Token-efficient** - Compact prompts for cost optimization
- **Example**: `generate-poi-repair-maintenance.ts`

---

## Format 1: Deterministic JSON Generation

### Data Flow

```
Database Query → Filter POIs → Deduplicate → Group by Category → Generate Summary → Save JSON to DB
```

## Core Functions

### `dedupePois(pois: PoiRecord[]): PoiRecord[]`

**Purpose**: Remove duplicate POIs, keeping the nearest instance.

**Strategy**:
1. Primary deduplication: Use `osmId` if present (most reliable)
2. Secondary deduplication: Use normalized `(name + lat + lon)` for POIs without `osmId`
3. When duplicates found: Keep the one with smallest `distanceFt`
4. Sort final result by `distanceFt` ascending

**Key Pattern**:
```typescript
// Primary: osmId-based deduplication
const byOsmId = new Map<number, PoiRecord>();
if (poi.osmId != null) {
  const existing = byOsmId.get(poi.osmId);
  if (!existing || distanceFt < existing.distanceFt) {
    byOsmId.set(poi.osmId, poi);
  }
}
```

### `prepareCleanPois(pois: PoiRecord[]): CleanPoi[]`

**Purpose**: Normalize POI data for consistent processing.

**Transforms**:
- Derives display name (handles `name: null` cases)
- Formats distance (`distanceFt` → `"~400 ft"` or `"~0.4 mi"`)
- Parses JSON tags safely
- Preserves category and distanceFt for sorting

**Key Pattern**:
```typescript
function derivePoiName(poi: PoiRecord): string {
  // Priority: poi.name > tags.name > tags.brand > category-based fallback
  if (poi.name) return poi.name.trim();
  const tags = safeJsonParse(poi.tags);
  return tags.name || tags.brand || getCategoryFallback(poi.category);
}
```

### `groupPoisByCategory(pois: CleanPoi[]): HighlightGroup[]`

**Purpose**: Organize POIs into highlight groups for JSON output.

**Process**:
1. Group POIs by `category` field
2. Sort items within each group by `distanceFt` ascending
3. Map categories to display labels (e.g., `"information"` → `"Visitor information"`)
4. Sort groups by nearest item distance (group with closest POI first)
5. Limit to 3 groups maximum

**Key Pattern**:
```typescript
// Sort groups by nearest item distance
groups.sort((a, b) => {
  const aNearest = a.items[0]?.distanceFt ?? Infinity;
  const bNearest = b.items[0]?.distanceFt ?? Infinity;
  return aNearest - bNearest;
});
```

### `buildDeterministicSummary(cleanPois: CleanPoi[], highlightGroups: HighlightGroup[]): string`

**Purpose**: Generate summary text using templates based on `poiCount`.

**Template Strategy**:
- **poiCount = 1**: Single sentence mentioning nearest POI
- **poiCount = 2**: Explicit enumeration with category labels and usefulness clause
- **poiCount = 3+**: Count + range (nearest to farthest)

**Key Requirements**:
- Always mentions nearest POI first
- Includes "near this Chinese buffet" exactly once
- Category-accurate language (attractions ≠ services)
- No quantity exaggeration
- 1-2 sentences, 50-90 words

**Template Example (poiCount = 2)**:
```typescript
`Near this Chinese buffet, there are two nearby travel-related places: ${nearest.name} (${poi1CategoryLabel}) at ${nearest.distanceText} and ${second.name} (${poi2CategoryLabel}) at ${second.distanceText}, which can be useful for basic trip planning or local visitor guidance.`
```

### Progress Tracking & Checkpointing

### Checkpoint System

**Purpose**: Allow script to resume after interruption.

**Structure**:
```typescript
type Checkpoint = {
  [buffetId: string]: {
    status: 'generated' | 'skipped_existing' | 'skipped_no_pois' | 'error';
    timestamp: number;
    poiCount?: number;
    errorMessage?: string;
  };
};
```

**Usage**:
- Save checkpoint every 10 processed items
- On resume: Skip buffets already in checkpoint
- Final checkpoint save at end

### Progress Reporting

**Updates every 10 items**:
- Items processed, generated, skipped, failed
- Percentage complete (if limit set)
- Processing rate (items/second)
- ETA (estimated time remaining)

**Pattern**:
```typescript
if (processed % 10 === 0) {
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = processed / elapsed;
  const remaining = limit > 0 ? limit - processed : null;
  const eta = remaining && rate > 0 ? Math.round(remaining / rate) : null;
  // Log progress...
}
```

### Batch Processing Pattern

### Query Strategy

**Approach**: Fetch buffets in batches, filter in-memory, process with concurrency.

**Flow**:
1. Query `batchSize` buffets (default: 100)
2. Filter to find buffets needing processing:
   - Skip if already has field populated
   - Skip if no eligible POIs in target group
3. Schedule for processing (respect limit)
4. Process with `pLimit` concurrency control
5. Continue until limit reached or no more buffets

**Key Pattern**:
```typescript
const limiter = pLimit(concurrency);
const promises = toProcess.map(buffet =>
  limiter(async () => {
    const result = await processBuffet(buffet, checkpoint, db, options);
    // Handle result...
  })
);
await Promise.all(promises);
```

### Database Write Pattern

**Location**: `processBuffet()` function

**Pattern**:
```typescript
// Generate output
const { output } = await generateDescription(cleanPois, highlightGroups);

// Write to database if not dry run
if (!options.dryRun) {
  const jsonString = JSON.stringify(output);
  await db.transact([
    db.tx.buffets[buffetId].update({ 
      travelTourismServices: jsonString 
    })
  ]);
}
```

**Output Format**:
```typescript
{
  summary: string,           // 1-2 sentences, 50-90 words
  highlights: HighlightGroup[], // Up to 3 groups, sorted by distance
  poiCount: number,          // Exact count of POIs used
  generatedAt: string,       // ISO timestamp
  model: 'deterministic'     // Always 'deterministic'
}
```

---

## Format 2: LLM-Based Plain Text Generation

### Overview

This approach uses an LLM (Groq API) to generate a single SEO-optimized paragraph. The output is stored as a plain string field in the database.

### Key Architecture Decisions

1. **LLM-Based Generation**
   - Uses Groq API (e.g., `llama-3.1-8b-instant`)
   - Compact prompts for token efficiency (~500-700 tokens)
   - Single paragraph output (80-150 words)
   - No retry logic for length - skip if outside range

2. **Data Flow**

```
Database Query → Filter POIs → Deduplicate → Select 2-5 POIs → Build Prompt → LLM Call → Validate → Save Text to DB
```

### Core Functions

#### `dedupePois(pois: PoiRecord[]): PoiRecord[]`

Same as Format 1 - removes duplicates, keeps nearest instance.

#### `selectVariedPois(pois: PoiRecord[]): PoiRecord[]`

**Purpose**: Select 2-5 POIs with category variety.

**Strategy**:
1. Always include closest 2 POIs
2. If top 5 are all same category, try to include a different category from top 10
3. Fill remaining slots (up to 5 total) with closest remaining POIs
4. Re-sort by distance

**Key Pattern**:
```typescript
// Always include closest 2
const selected: PoiRecord[] = [pois[0], pois[1]];
const selectedCategories = new Set<string>([pois[0].category || '', pois[1].category || '']);

// Try to add variety if all same category
if (categoryCounts.size >= 2 && selectedCategories.size === 1) {
  // Find a POI from a different category
  for (const poi of top10.slice(2)) {
    const cat = poi.category || '';
    if (!selectedCategories.has(cat)) {
      selected.push(poi);
      selectedCategories.add(cat);
      break;
    }
  }
}
```

#### `prepareCleanPois(pois: PoiRecord[]): CleanPoi[]`

**Purpose**: Normalize POI data for LLM prompt.

**Transforms**:
- Derives display name (handles `name: null` cases)
- Converts `distanceFt` to miles with 2 decimals (e.g., `"0.35 mi"`)
- Maps category to human-readable label (e.g., `car_repair` → `"car repair"`)
- Selects at most ONE detail per POI: address OR opening hours OR website
- Explicitly excludes phone numbers

**Key Pattern**:
```typescript
function prepareCleanPois(pois: PoiRecord[]): CleanPoi[] {
  return pois.map(poi => {
    const displayName = derivePoiName(poi, category);
    const serviceLabel = getCategoryLabel(category);
    const distanceMiles = formatDistanceMiles(poi.distanceFt);
    
    // Select at most ONE detail
    let shortAddress: string | undefined;
    let openingHours: string | undefined;
    let website: string | undefined;
    
    const tags = safeJsonParse(poi.tags);
    if (tags['addr:street'] && tags['addr:housenumber']) {
      shortAddress = `${tags['addr:housenumber']} ${tags['addr:street']}`;
    }
    if (tags.opening_hours) openingHours = tags.opening_hours;
    if (tags.website) website = tags.website;
    
    // Prefer address > hours > website
    const selectedDetail = shortAddress || openingHours || website;
    
    return {
      displayName,
      serviceLabel,
      distanceMiles,
      shortAddress: shortAddress ? selectedDetail : undefined,
      openingHours: !shortAddress && openingHours ? selectedDetail : undefined,
      website: !shortAddress && !openingHours && website ? selectedDetail : undefined
    };
  });
}
```

#### `buildPrompt(buffetName: string | null, cityState: string | undefined, poiList: CleanPoi[]): string`

**Purpose**: Build compact LLM prompt with all rules.

**Key Requirements**:
- **Compact** - Target ~500-700 tokens total
- **Clear rules** - All constraints in bullet format
- **POI data** - Simple list format with essential details only
- **No redundancy** - Avoid repeating rules

**Example Prompt Structure**:
```typescript
return `Write ONE paragraph (80-150 words) about repair/maintenance services near a Chinese buffet.

RULES:
- Plain text only. No bullets, headings, or blank lines.
- Refer to "the buffet" (never mention buffet name in body).
- No city/state names. No other restaurant/dining names.
- Mention 2-5 POIs from the list, closest first. Each POI needs distance in miles.
- Per POI: distance + at most ONE detail (address OR hours OR website). No phones.
- Only mention POIs provided. No generic references ("other shops", "local mechanics").
- No superlatives, opinions, or filler ("nearby residents", "after a meal").
- Include words: "nearby", "repair", "maintenance", "close to the buffet".
- End with: "Availability and hours may vary."

Buffet: "${buffetNameText}"

POI_LIST:
${poiListText}

Write the paragraph now.`;
```

#### `generateWithGroq(prompt: string, model: string): Promise<{ text: string; tokens?: TokenUsage }>`

**Purpose**: Call Groq API with retry logic and token tracking.

**Key Features**:
- Retry on server errors (500-599)
- Rate limit handling (429) with exponential backoff
- Token usage tracking
- Compact system message (~25 tokens)

**Pattern**:
```typescript
const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model,
    temperature: 0.2,
    max_tokens: 250,
    messages: [
      {
        role: 'system',
        content: 'SEO writer. Plain text paragraph only. Use only provided POI data. No phones, no city/state, no buffet name in body, no other restaurants. 80-150 words.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  })
});
```

#### `generateDescription(buffetName: string | null, cleanPois: CleanPoi[], cityState: string | undefined, model: string): Promise<{ text: string; tokens?: TokenUsage }>`

**Purpose**: Orchestrate prompt building, LLM call, and validation.

**Validation**:
- Word count: 80-150 words
- If outside range: return empty string (skip, don't retry)
- No retry logic for length to save tokens

**Pattern**:
```typescript
const prompt = buildPrompt(buffetName, cityState, cleanPois);
const { text, tokens } = await generateWithGroq(prompt, model);
const wordCount = countWords(text);

if (wordCount < 80 || wordCount > 150) {
  console.log(`  Generated text outside range: ${wordCount} words, skipping...`);
  return { text: '', tokens };
}

return { text: text.trim(), tokens };
```

### Database Write Pattern

**Location**: `processBuffet()` function

**Pattern**:
```typescript
// Generate text
const { text, tokens } = await generateDescription(buffetName, cleanPois, cityState, model);

// Validate word count
const wordCount = countWords(text);
if (wordCount < 80 || wordCount > 150) {
  throw new Error(`Generated text outside range: ${wordCount} words`);
}

// Write to database if not dry run
if (!options.dryRun) {
  await db.transact([
    db.tx.buffets[buffetId].update({ 
      repairMaintenance: text.trim()
    })
  ]);
}
```

**Output Format**:
```typescript
// Plain string, 80-150 words
"Several repair and maintenance services are available close to the buffet, offering a range of options for car owners and cyclists. Caliber Collision South, a car repair service, is located 0.35 miles away, with a physical address at 1345 Lewis Street Southeast. Whitlock's Sewing Center, a sewing shop, is situated 0.39 miles from the buffet, providing services for clothing and textile repair. Dero, a bicycle repair station, is available 0.55 miles away, operating 24/7 to cater to cyclists' needs. These services are nearby, offering convenient access to repair and maintenance options for various types of equipment. Availability and hours may vary."
```

### Token Optimization Strategies

1. **Compact Prompt**: Combine rules into single bullet list (~200 tokens vs ~1,500)
2. **Short System Message**: Essential constraints only (~25 tokens vs ~150)
3. **No Retry Logic**: Skip if outside range instead of retrying (saves 2x token cost)
4. **Minimal POI Data**: Only essential fields (name, service, distance, one detail)

**Expected Token Usage**:
- Prompt: ~500-700 tokens
- Completion: ~150-250 tokens
- Total per generation: ~650-950 tokens
- With retries removed: ~85% reduction vs. verbose prompts

---

## Shared Patterns (Both Formats)

## Adapting for Other POI Groups

### For Deterministic JSON Format

#### Step 1: Update Constants
```typescript
const TARGET_GROUP = 'Your Group Name';  // e.g., 'Food & Dining'
const CHECKPOINT_FILE = path.join(__dirname, 'checkpoint-your-group.json');
```

#### Step 2: Update Schema Field
```typescript
// In processBuffet():
buffet.yourFieldName  // e.g., foodDining

// In database write:
db.tx.buffets[buffetId].update({ yourFieldName: jsonString })
```

#### Step 3: Update Category Labels
```typescript
// In groupPoisByCategory():
const categoryLabels: Record<string, string> = {
  'your_category': 'Your Display Label',
  // ...
};
```

#### Step 4: Update Summary Templates
```typescript
// In buildDeterministicSummary():
// Adjust category descriptions and templates for your group
const categoryDescriptions: Record<string, { singular: string; plural: string }> = {
  // Your category mappings
};
```

### For LLM-Based Plain Text Format

#### Step 1: Update Constants
```typescript
const TARGET_GROUP = 'Your Group Name';  // e.g., 'Repair & Maintenance Services'
const CHECKPOINT_FILE = path.join(__dirname, 'checkpoints', 'your-group.checkpoint.json');
const DEFAULT_MODEL = 'llama-3.1-8b-instant'; // Or your preferred model
```

#### Step 2: Update Schema Field
```typescript
// In processBuffet():
buffet.yourFieldName  // e.g., repairMaintenance

// In database write:
db.tx.buffets[buffetId].update({ yourFieldName: text.trim() })
```

#### Step 3: Update Category Labels
```typescript
// In getCategoryLabel():
function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    'your_category': 'Your Display Label',
    // ...
  };
  return labels[category] || category.replace(/_/g, ' ');
}
```

#### Step 4: Update Prompt Rules
```typescript
// In buildPrompt():
// Adjust rules and keywords for your POI group
// Example: For "Food & Dining", include keywords like "restaurants", "dining options", etc.
```

#### Step 5: Update Word Count Range (if needed)
```typescript
// In generateDescription() and processBuffet():
// Adjust minimum/maximum word count if needed
// Default: 80-150 words
```

## Key Design Principles

### Shared Principles (Both Formats)
1. **Distance-Based Ordering**: Always sort by `distanceFt` ascending
2. **Exact Data Matching**: Use exact POI names/distances, no renaming
3. **Progress Visibility**: Report every 10 items with rate and ETA
4. **Resume Capability**: Checkpoint system allows safe interruption/resume
5. **Deduplication**: Remove duplicates, keep nearest instance

### Format 1 (Deterministic JSON) Specific
1. **Deterministic First**: Templates guarantee valid output, no retries needed
2. **Category Accuracy**: Use category-appropriate language (attractions ≠ services)
3. **Quantity Accuracy**: Match language to actual `poiCount` (singular/plural/explicit count)
4. **Structured Output**: JSON with summary + highlights array

### Format 2 (LLM Plain Text) Specific
1. **Token Efficiency**: Compact prompts, minimal system messages
2. **No Retry Logic**: Skip if outside range instead of retrying (saves tokens)
3. **SEO Optimization**: Natural text with keyword enforcement
4. **Single Paragraph**: Plain text block, no breaks or formatting

### Error Handling

**Strategy**: Continue processing on individual failures, log errors, track in checkpoint.

**Pattern**:
```typescript
try {
  const result = await processBuffet(buffet, checkpoint, db, options);
  // Handle success...
} catch (error: any) {
  failed++;
  checkpoint[buffetId] = {
    status: 'error',
    timestamp: Date.now(),
    errorMessage: error?.message || String(error)
  };
  console.error(`[ERROR] ${buffet.name}: ${error?.message}`);
  processed++;
}
```

**Format 2 Specific**: For LLM-based scripts, also handle empty string returns (fail-safe):
```typescript
const { text } = await generateDescription(...);
if (text.trim().length === 0) {
  // LLM returned empty string per fail-safe rule
  return { status: 'skipped_no_pois' };
}
```

### Performance Considerations

- **Concurrency**: Default 3, adjust based on database connection limits and API rate limits
- **Batch Size**: Default 100, balance memory vs. query overhead
- **Checkpoint Frequency**: Every 10 items (balance safety vs. I/O)
- **Progress Reporting**: Every 10 items (balance visibility vs. noise)
- **Format 2 Specific**: Monitor token usage; adjust model or prompt if costs are high

### Testing Strategy

1. **Dry Run First**: `--dry-run --limit 10` to verify output format
2. **Small Batch**: `--limit 50` to test database writes
3. **Full Run**: Remove `--limit` for production (or use `--resume` for safety)
4. **Resume Test**: Interrupt and resume with `--resume` flag
5. **Format 2 Specific**: Check token usage summary at end; verify word counts are in range
