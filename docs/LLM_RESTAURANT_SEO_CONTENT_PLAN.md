# LLM Restaurant SEO Content Plan

## Goal

Improve indexability of restaurant detail pages by adding grounded, restaurant-specific content that gives Google clearer evidence that each page is useful, unique, and worth indexing.

The first rollout target is a generated `llmSeoSummary` for restaurant pages that are crawled but not indexed, especially pages with strong existing signals but missing or weak descriptions.

## Search Console Findings

The "Crawled - currently not indexed" export is heavily weighted toward restaurant pages.

- Not indexed sample: 892 restaurant pages, 51 city pages, 34 neighborhood pages, 23 city facet pages
- Indexed sample: 574 restaurant pages, 114 city pages, 174 neighborhood pages, 137 city facet pages, 1 homepage
- Restaurant pages are the main weak spot.
- Live sampled restaurant pages return `200`, use self-canonicals, expose `index, follow`, and include JSON-LD.
- The issue appears to be perceived quality/value rather than basic crawlability.

Local data comparison suggests indexed restaurant pages have somewhat stronger signals:

- Higher average review count in the matched sample
- Slightly better description coverage
- Both indexed and not-indexed restaurant samples are weak on differentiating fields such as FAQs, menu items, structured attributes, and review tags

## Model And Cost Assumption

Use OpenRouter model:

```text
deepseek/deepseek-v4-flash
```

Pricing checked on 2026-06-18:

- Approximate input price: $0.09 per 1M tokens
- Approximate output price: $0.18 per 1M tokens

Estimated description generation cost:

- Input: about 1,200 tokens per restaurant
- Output: about 250 tokens per generated summary
- Estimated cost: about $0.00015 per restaurant

Conservative operating budget:

- $0.0003-$0.001 per page after retries, validation, richer input, and provider variance
- 1,000 pages: about $0.30-$1.00
- 10,000 pages: about $3-$10

Cost is low enough that quality controls matter more than token price.

## First Content Product: `llmSeoSummary`

Generate a concise, grounded restaurant summary for each selected page.

Target length:

- 120-180 words

Purpose:

- Explain what the restaurant is
- Mention the city/neighborhood when known
- Summarize reliable signals from ratings, reviews, hours, categories, amenities, photos, and nearby context
- Make each detail page feel meaningfully distinct

Strict grounding rules:

- Do not invent menu items, prices, amenities, cuisine types, ownership, popularity, or service options.
- Use exact facts when present in source data.
- Use review-derived wording only when review text or review summaries exist.
- If a field is missing, omit it rather than filling the gap.
- Avoid repetitive boilerplate across pages.
- Avoid claims like "best", "famous", "popular", or "authentic" unless supported by source data.

## Prioritization

Start with pages that are most likely to become indexable after content improvement.

Priority 1:

- In Search Console as "Crawled - currently not indexed"
- Restaurant detail pages
- Valid `200` pages with `index, follow`
- Missing or short descriptions
- High review count
- Has photos
- Has hours
- Has address and city

Priority 2:

- Not-indexed restaurant pages with moderate reviews but strong local context
- Restaurants in cities where related city/facet/neighborhood pages are already indexed
- Restaurants linked from indexed hub pages

Priority 3:

- Lower-review or sparse-data restaurants
- Pages requiring additional enrichment before LLM generation would be useful

Do not start with every page. Use a small batch first, compare quality, then expand.

## Recommended Generated Fields

Initial field:

```ts
llmSeoSummary: string
```

Later fields:

```ts
llmCustomerHighlights: string[]
llmBestFor: string[]
llmGoodToKnow: string[]
llmFaqs: Array<{ question: string; answer: string }>
llmMenuHighlights: string[]
```

## Input Payload For Generation

The prompt should receive structured data, not raw page HTML.

Recommended inputs:

- Restaurant name
- City, state, neighborhood
- Address
- Rating and review count
- Categories
- Hours summary
- Price if known
- Website/phone presence
- Photos count
- Existing description fields
- Review summaries or selected review snippets when available
- Menu items when available
- Amenities/service options when available
- Nearby city/neighborhood/facet context when available

## Prototype Prompt Spec

Use this prompt for the first `llmSeoSummary` prototype. The output must be JSON so the generation step can validate and store it without parsing prose.

System message:

```text
You write grounded local restaurant summaries for a Chinese buffet directory.

Your job is to turn structured source data into useful page content. Use only the facts provided in the input. Do not invent menu items, prices, amenities, awards, popularity claims, ownership, service options, or neighborhood details.

Write naturally for a search visitor deciding whether this restaurant is relevant. Avoid generic SEO filler, repeated openings, and exaggerated claims. If the source data is sparse, write a shorter but still specific summary instead of guessing.

Return only valid JSON matching the requested schema.
```

User message template:

```text
Generate one grounded restaurant SEO summary.

Requirements:
- Write 120-180 words when the source data supports it.
- If the source data is thin, write 80-120 words.
- Mention the restaurant name once in the first sentence.
- Mention the city and state naturally.
- Use rating and review count only if both are present.
- Mention hours, photos, website, phone, amenities, review themes, menu items, or nearby context only when provided.
- Do not say "best", "top", "famous", "popular", "authentic", "cheap", or "family-friendly" unless the source data directly supports that wording.
- Do not use markdown.
- Do not include unsupported claims.

Return this JSON shape:
{
  "llmSeoSummary": "string",
  "sourceFieldsUsed": ["string"],
  "omittedBecauseMissing": ["string"],
  "riskNotes": ["string"]
}

Source data:
{{restaurant_json}}
```

Expected source JSON shape:

```json
{
  "url": "https://buffetlocator.com/chinese-buffets/example-city-st/example-buffet",
  "name": "Example Buffet",
  "city": "Example City",
  "state": "ST",
  "neighborhood": null,
  "address": "123 Example St, Example City, ST",
  "rating": 4.1,
  "reviewsCount": 850,
  "categories": ["Chinese restaurant", "Buffet restaurant"],
  "hoursSummary": "Open daily",
  "price": null,
  "hasWebsite": true,
  "hasPhone": true,
  "photosCount": 10,
  "existingDescription": null,
  "reviewThemes": [],
  "menuItems": [],
  "amenities": [],
  "nearbyContext": []
}
```

Prototype validation rules:

- `llmSeoSummary` must be a non-empty string.
- `llmSeoSummary` should be 80-180 words.
- `sourceFieldsUsed` must name every source category used.
- `riskNotes` should be empty unless the model had to keep the summary short because data was sparse.
- Reject output containing claims that cannot be traced to the source JSON.
- Reject output that repeats the same first-sentence structure across multiple generated summaries.

## Quality Checks

For each generated summary:

- Validate length target.
- Reject unsupported claims.
- Reject summaries that mention facts not present in source data.
- Reject repetitive template openings.
- Reject summaries that are too generic to distinguish the restaurant.
- Store source fields used for auditability.

Suggested metadata:

```ts
llmSeoSummaryModel: "deepseek/deepseek-v4-flash"
llmSeoSummaryGeneratedAt: string
llmSeoSummarySourceHash: string
llmSeoSummaryStatus: "draft" | "approved" | "rejected"
```

## Rollout Plan

1. Build a 10-page prototype using not-indexed restaurant pages with high review counts and weak descriptions.
2. Review generated summaries manually for factuality, uniqueness, and usefulness.
3. Add a validation pass that rejects unsupported or repetitive output.
4. Generate a 100-page batch.
5. Publish summaries behind the existing restaurant-page template.
6. Monitor Search Console for crawl/indexing changes over 2-6 weeks.
7. Expand to FAQ and review-derived highlight generation if summaries perform well.

## Success Metrics

Primary:

- Reduction in "Crawled - currently not indexed" restaurant pages
- Increase in indexed restaurant detail pages

Secondary:

- More impressions for restaurant detail pages
- More long-tail queries per restaurant page
- Higher crawl frequency for enriched pages
- Stable or improved average position on indexed detail pages

## First Implementation Slice

Create a tiny prototype for `llmSeoSummary` only.

Inputs:

- 5 not-indexed restaurant pages
- 5 indexed restaurant pages for comparison

Output:

- Generated summaries saved as draft data
- Estimated token use and actual cost
- Manual review notes

No automatic publishing in the first slice.
