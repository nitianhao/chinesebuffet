# UX Redesign Recommendation: Restaurant Detail Page Information Section

## A) Critique of Current Three Cards

### Card 1: "At a glance"
**Problems:**
- **100% redundant** with hero header (rating, price, address, open status all duplicated)
- Wastes prime real estate on facts users already saw
- Service options (Dine-in, Takeout, Delivery) are useful but buried
- No decision-making value—just a data dump

### Card 2: "Why people like it"
**Problems:**
- **Sounds robotic**: "(mentioned in X reviews)" reads like algorithm output, not human insight
- **Weak signal**: Raw mention counts don't tell users *why* it matters or *how* it feels
- **No context**: "Value / Price" mentioned 23 times—so what? Is it good value or bad?
- **Competes for attention** with equal visual weight despite being the most valuable content
- Missing sentiment—are people saying "great value" or "overpriced"?

### Card 3: "Good to know"
**Problems:**
- **Generic checklist** with no prioritization
- **Low decision value**: "Credit cards accepted" is table stakes, not a differentiator
- **No grouping**: Parking, accessibility, and alcohol are mixed together
- **Too many items** (up to 6) creates scanning fatigue
- Some items (like "Kid-friendly") could be decision-critical but get lost

---

## B) Structural Recommendation

**Chosen approach: Reduce to two cards with clear hierarchy**

### Justification:
1. **Eliminates redundancy**: Remove "At a glance" entirely—hero already covers it
2. **Creates clear hierarchy**: 
   - **Primary card** (larger, more prominent): Human-readable review insights
   - **Secondary card** (compact, scannable): Practical logistics that affect the visit
3. **Better mobile experience**: Two cards stack cleanly; three creates awkward breaks
4. **Increases signal-to-noise**: Each card has a distinct purpose
5. **Faster decision-making**: User scans review signals first (emotional), then logistics (practical)

**Why not merge into one?**
- Review insights and practical logistics serve different mental models
- Users need to distinguish "what's it like?" from "can I actually go?"
- Two cards allow progressive disclosure on mobile

**Why not keep three?**
- "At a glance" is pure redundancy
- Three equal cards create decision paralysis
- Mobile stacking becomes cluttered

---

## C) Proposed New Structure

### Section Title:
*(None—let the cards speak for themselves. Section sits below map, context is clear.)*

---

### Card 1: "What stands out" (Primary, ~60% width on desktop)

**Purpose**: Translate review themes into human-readable decision signals

**Structure**:
- **Top 3-4 themes only** (not 6)
- Each theme displayed as:
  ```
  [Icon/Emoji] [Human phrase] 
  [Brief context sentence]
  ```
- **No mention counts visible** (hide the algorithm)
- **Sentiment-aware**: Show positive signals only (if mixed/negative, skip or reframe)
- **Visual hierarchy**: Larger text, subtle background color, more padding

**Content rules**:
- **REMOVE**: Raw counts "(mentioned in X reviews)"
- **REMOVE**: Generic labels like "Value / Price"
- **KEEP**: Theme extraction logic, but transform output
- **ADD**: Human phrases like "Great value for families" instead of "Value / Price (23)"
- **ADD**: One-sentence context: "Multiple reviewers mention generous portions at reasonable prices"
- **MAX**: 4 themes (top 3 by default, 4th only if very strong signal)

**Example transformation**:
- ❌ Old: "Value / Price (mentioned in 23 reviews)"
- ✅ New: "💰 Great value for families — Generous portions at reasonable prices"

**Data mapping**:
- `value` → "Great value" or "Affordable prices"
- `food_quality` → "Fresh, quality food" or "Well-prepared dishes"
- `variety` → "Huge selection" or "Lots of options"
- `service` → "Friendly service" or "Attentive staff"
- `atmosphere` → "Clean, comfortable" or "Nice atmosphere"
- `speed` → "Quick service" or "No long waits"

---

### Card 2: "Before you go" (Secondary, ~40% width on desktop)

**Purpose**: Practical logistics that affect visit planning

**Structure**:
- **Compact list format** (not full sentences)
- **Grouped by category** (subtle visual separation):
  - 🚗 Getting there (parking, accessibility)
  - 💳 Payment (cards accepted)
  - 👨‍👩‍👧‍👦 Planning (reservations, kid-friendly)
  - 🍺 Extras (alcohol)
- **Icon + label** (no bullets, cleaner)
- **Maximum 5 items** (prioritize decision-critical)

**Content rules**:
- **REMOVE**: Generic "Credit cards accepted" (assume it's standard)
- **REMOVE**: "Reservations accepted" (only show if reservations are *required* or *not available*)
- **KEEP**: Parking (decision-critical for many)
- **KEEP**: Wheelchair accessibility (important for some users)
- **KEEP**: Kid-friendly (decision-critical for families)
- **KEEP**: Alcohol served (decision factor for some)
- **ADD**: Only show items that are **unusual** or **decision-critical**
- **MAX**: 5 items total

**Prioritization logic**:
1. Parking available (if true)
2. Wheelchair accessible (if true)
3. Kid-friendly (if true)
4. Alcohol served (if true)
5. Reservations required/not available (if unusual)

**Hide if**:
- Credit cards accepted (assumed standard)
- Reservations accepted (only show if required/not available)

---

## D) Content Rules Summary

### What to REMOVE entirely:
- ✅ Rating, price, address, open status (already in hero)
- ✅ Raw mention counts "(mentioned in X reviews)"
- ✅ Generic "Credit cards accepted" (assumed)
- ✅ "Reservations accepted" (only show if required/not available)
- ✅ Service options (Dine-in, Takeout, Delivery) from summary panel (move to hero if needed)

### What to KEEP but compress:
- ✅ Review themes (but transform to human phrases)
- ✅ Parking, accessibility, kid-friendly, alcohol (but only if decision-critical)
- ✅ Theme extraction algorithm (but hide the mechanics)

### What to ADD:
- ✅ Human-readable phrases for themes ("Great value" not "Value / Price")
- ✅ One-sentence context per theme
- ✅ Sentiment filtering (show positive signals, skip negative/mixed unless strong)
- ✅ Visual grouping in logistics card (icons, subtle categories)

### Maximum items:
- **Card 1**: 4 themes max
- **Card 2**: 5 items max

---

## E) Mobile Behavior

### Stacking order:
1. **"What stands out"** appears first (most valuable for decision-making)
2. **"Before you go"** appears second (supporting logistics)

### What appears first:
- **Card 1**: Top 3 themes visible, 4th behind "Show 1 more" if exists
- **Card 2**: Top 3 items visible, remaining behind "Show more" if >3 items

### What collapses behind "Show more":
- **Card 1**: 4th theme (if exists)
- **Card 2**: Items 4-5 (if >3 items)

### What can be safely hidden on mobile:
- **Card 1**: Nothing—all themes are valuable
- **Card 2**: Lower-priority items (alcohol, reservations) can collapse first

### Mobile-specific optimizations:
- **Card 1**: Larger touch targets, more spacing between themes
- **Card 2**: Compact list, smaller icons, tighter spacing
- Both cards: Full width, no side-by-side on mobile

---

## F) Copy & Labeling

### Section titles:

**Card 1: "What stands out"**
- ✅ User-centric: Answers "what makes this place special?"
- ✅ Action-oriented: Implies these are the differentiators
- ❌ Avoid: "Why people like it" (sounds algorithmic)
- ❌ Avoid: "Review highlights" (too generic)

**Card 2: "Before you go"**
- ✅ Practical: Signals this is planning info
- ✅ Time-bound: Implies "check this before visiting"
- ❌ Avoid: "Good to know" (too vague)
- ❌ Avoid: "Amenities" (too technical)

### Improved phrasing examples:

**Review themes** (Card 1):
- ❌ "Value / Price (mentioned in 23 reviews)"
- ✅ "💰 Great value for families — Generous portions at reasonable prices"

- ❌ "Food Quality (mentioned in 18 reviews)"
- ✅ "🍽️ Fresh, quality food — Multiple reviewers praise the freshness"

- ❌ "Variety (mentioned in 15 reviews)"
- ✅ "📋 Huge selection — Lots of options to choose from"

**Logistics** (Card 2):
- ❌ "Credit cards accepted"
- ✅ *(Remove—assumed standard)*

- ❌ "Parking available"
- ✅ "🅿️ Parking available"

- ❌ "Wheelchair accessible entrance"
- ✅ "♿ Wheelchair accessible"

- ❌ "Kid-friendly"
- ✅ "👨‍👩‍👧‍👦 Kid-friendly"

- ❌ "Alcohol served"
- ✅ "🍺 Alcohol served"

### Microcopy improvements:

**"Show more" button** (if needed):
- ✅ "Show 1 more highlight"
- ❌ "Show more" (too generic)

**Empty states** (if no themes):
- ✅ *(Hide card entirely—don't show empty)*

**Disclaimer** (if needed at bottom):
- ❌ "Summaries are based on available listing data and customer reviews."
- ✅ *(Remove—unnecessary, reduces trust)*

---

## Rationale: Why This Improves UX and Decision-Making

### 1. **Eliminates cognitive load**
- Removes 100% redundant "At a glance" card
- Users don't re-read facts they already saw
- Frees mental space for decision-making

### 2. **Increases signal-to-noise ratio**
- Card 1 focuses on **emotional signals** (what's it like?)
- Card 2 focuses on **practical signals** (can I go?)
- Each card has a clear purpose, no overlap

### 3. **Makes review data human**
- Transforms algorithmic output into readable insights
- Hides mention counts (users don't care about the algorithm)
- Adds context sentences that explain *why* it matters

### 4. **Creates clear visual hierarchy**
- Card 1 (larger, more prominent) = emotional decision factors
- Card 2 (compact, scannable) = practical logistics
- Users scan in priority order

### 5. **Improves mobile experience**
- Two cards stack cleanly (three creates awkward breaks)
- Progressive disclosure via "Show more" prevents overwhelming
- Touch-friendly spacing and targets

### 6. **Faster decision-making**
- Users can answer "Is this worth going to?" in under 3 seconds
- Top 3-4 themes provide enough signal without overload
- Logistics card answers "Can I actually visit?" quickly

### 7. **Better for Google traffic**
- Mobile-first users get critical info immediately
- Reduced scrolling to find decision factors
- Clear, scannable format matches mobile reading patterns

---

## Implementation Notes

### Technical considerations:
- **Card 1**: Transform `extractThemes()` output into human phrases via mapping object
- **Card 2**: Filter `getGoodToKnowItems()` to only decision-critical items
- **Sentiment**: Use existing review sentiment analysis (if available) to filter themes
- **Responsive**: Use `grid-cols-1 md:grid-cols-2` with `md:col-span-2` for Card 1, `md:col-span-1` for Card 2

### Data dependencies:
- Review themes (already extracted)
- Amenities data (already available)
- Sentiment analysis (if available, use it; if not, show all themes)

### Fallback behavior:
- If no themes: Hide Card 1 entirely
- If no logistics: Hide Card 2 entirely
- If both empty: Hide entire section

---

## Visual Mockup Concept

```
┌─────────────────────────────────────────────────────────┐
│  What stands out                    [60% width desktop]  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 💰 Great value for families                      │  │
│  │    Generous portions at reasonable prices        │  │
│  │                                                   │  │
│  │ 🍽️ Fresh, quality food                           │  │
│  │    Multiple reviewers praise the freshness       │  │
│  │                                                   │  │
│  │ 📋 Huge selection                                 │  │
│  │    Lots of options to choose from                │  │
│  │                                                   │  │
│  │ [View reviews →]                                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  Before you go              [40% width desktop]         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🅿️ Parking available                             │  │
│  │ ♿ Wheelchair accessible                          │  │
│  │ 👨‍👩‍👧‍👦 Kid-friendly                                │  │
│  │ 🍺 Alcohol served                                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Mobile stacking:**
```
┌─────────────────────────────┐
│  What stands out            │
│  [Full width, stacked]      │
└─────────────────────────────┘
┌─────────────────────────────┐
│  Before you go              │
│  [Full width, stacked]      │
└─────────────────────────────┘
```

---

## Success Metrics (Future)

- **Time to decision**: Users should answer "Is this worth visiting?" faster
- **Scroll depth**: Users should find decision factors without scrolling past map
- **Engagement**: "View reviews" link click-through should increase (better context)
- **Mobile bounce**: Reduced bounce rate on mobile (better mobile experience)

---

## Next Steps

1. Implement theme-to-phrase mapping in `lib/reviewThemes.ts`
2. Refactor `BuffetSummaryPanel.tsx` to two-card structure
3. Add sentiment filtering (if available)
4. Update mobile responsive classes
5. Test with real data to ensure themes map correctly
6. A/B test old vs. new structure (if possible)
