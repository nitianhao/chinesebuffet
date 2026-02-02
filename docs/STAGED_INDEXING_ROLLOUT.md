# Staged Indexing Rollout

Gradual rollout system for indexing cities in phases to monitor performance and optimize crawl budget.

## Phases

### Phase 1: Top Cities Only
- **Target**: High-value, high-traffic cities
- **Criteria**:
  - Top 50 cities by rank
  - Population ≥ 200,000
  - At least 3 buffets
- **Purpose**: Focus crawl budget on highest-value locations first

### Phase 2: Mid-Tier Cities
- **Target**: Medium-value cities
- **Criteria**:
  - Top 200 cities by rank
  - Population ≥ 50,000
  - At least 2 buffets
- **Purpose**: Expand coverage to secondary markets

### Phase 3: Long-Tail Locations
- **Target**: All remaining cities
- **Criteria**:
  - No rank limit
  - Population ≥ 10,000
  - At least 1 buffet
- **Purpose**: Complete coverage of all locations

## Configuration

### Environment Variables

```bash
# Enable staged indexing
STAGED_INDEXING_ENABLED=true

# Set current phase
INDEXING_PHASE=phase-1  # Options: phase-1, phase-2, phase-3, all
```

### Default Configuration

```typescript
{
  enabled: false, // Disabled by default
  currentPhase: 'all', // Index all cities by default
  phase1Threshold: {
    maxRank: 50,
    minPopulation: 200000,
    minBuffetCount: 3,
  },
  phase2Threshold: {
    maxRank: 200,
    minPopulation: 50000,
    minBuffetCount: 2,
  },
  phase3Threshold: {
    maxRank: undefined,
    minPopulation: 10000,
    minBuffetCount: 1,
  },
}
```

## City Tier Classification

Cities are automatically classified into tiers based on thresholds:

- **Top Cities**: Meet Phase 1 thresholds
- **Mid-Tier Cities**: Meet Phase 2 but not Phase 1 thresholds
- **Long-Tail Cities**: Meet Phase 3 but not Phase 2 thresholds

## Implementation

### Indexing Logic

**City Pages:**
- Check if city is indexable in current phase
- Apply `noindex` if city not in current phase
- Still accessible via direct URL (not indexed)

**Buffet Pages:**
- Inherit city's phase status
- Only indexed if parent city is in current phase
- Excluded from sitemap if city not in phase

**Neighborhood Pages:**
- Inherit city's phase status
- Only indexed if parent city is in current phase

**Sitemap Generation:**
- Only includes cities/buffets/neighborhoods in current phase
- Automatically excludes non-phase cities

### Files Modified

- `lib/staged-indexing.ts` - Core staging logic
- `app/chinese-buffets/[city-state]/page.tsx` - City page indexing
- `app/chinese-buffets/[city-state]/neighborhoods/[neighborhood]/page.tsx` - Neighborhood indexing
- `app/sitemap-cities.xml/route.ts` - City sitemap filtering
- `app/sitemap-buffets.xml/route.ts` - Buffet sitemap filtering
- `app/sitemap-neighborhoods.xml/route.ts` - Neighborhood sitemap filtering

## Usage

### Check Current Status

```bash
npm run staged-indexing-status
```

**Output:**
- Current phase and configuration
- City counts by tier
- Sample cities in each tier
- Which cities are currently indexed

### Enable Phase 1

```bash
export STAGED_INDEXING_ENABLED=true
export INDEXING_PHASE=phase-1
npm run build
```

### Progress to Phase 2

```bash
export STAGED_INDEXING_ENABLED=true
export INDEXING_PHASE=phase-2
npm run build
```

### Complete Rollout (Phase 3)

```bash
export STAGED_INDEXING_ENABLED=true
export INDEXING_PHASE=phase-3
npm run build
```

### Disable Staged Indexing

```bash
export STAGED_INDEXING_ENABLED=false
# or
export INDEXING_PHASE=all
npm run build
```

## Rollout Strategy

### Recommended Timeline

1. **Week 1-2: Phase 1**
   - Monitor indexing performance
   - Check search console for top cities
   - Verify crawl budget allocation

2. **Week 3-4: Phase 2**
   - Expand to mid-tier cities
   - Monitor impact on crawl budget
   - Check indexing rates

3. **Week 5+: Phase 3**
   - Complete rollout to all cities
   - Monitor long-tail performance
   - Optimize thresholds if needed

### Monitoring

- **Search Console**: Track indexing rates by city tier
- **Crawl Stats**: Monitor crawl budget usage
- **Performance**: Check page load times and rankings
- **Status Report**: Run `npm run staged-indexing-status` regularly

## Benefits

1. **Crawl Budget Optimization**: Focus on high-value cities first
2. **Performance Monitoring**: Gradual rollout allows monitoring at each phase
3. **Risk Mitigation**: Identify issues before full rollout
4. **Flexible Control**: Easy to pause or adjust phases
5. **Data-Driven**: Adjust thresholds based on performance data

## Notes

- **State Pages**: Always indexed (not affected by city phases)
- **POI Pages**: Always indexed (not affected by city phases)
- **Homepage**: Always indexed
- **Direct URLs**: Still accessible even if not indexed (noindex, not 404)
- **Sitemap**: Automatically filters based on current phase

## Troubleshooting

### Cities Not Indexing

1. Check current phase: `npm run staged-indexing-status`
2. Verify city meets phase thresholds
3. Check environment variables: `STAGED_INDEXING_ENABLED`, `INDEXING_PHASE`
4. Verify city has required data (rank, population, buffetCount)

### Unexpected Indexing

1. Verify staged indexing is enabled
2. Check if phase is set to 'all'
3. Review city tier classification
4. Check sitemap generation logs
