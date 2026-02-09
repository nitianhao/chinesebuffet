import { NextResponse } from 'next/server';

/**
 * GET /api/debug-robots
 *
 * Returns the expected robots meta values for a set of test-case page types.
 * Useful for verifying that the noindex/follow rules are applied correctly.
 *
 * Only available in non-production environments.
 *
 * Example response:
 * {
 *   "cases": [
 *     { "page": "city (valid, empty)", "expected": "noindex, follow", ... },
 *     ...
 *   ]
 * }
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const cases = [
    {
      page: 'city (invalid slug)',
      scenario: 'slug does not match any city in DB',
      expected: { index: false, follow: false },
      rule: 'Invalid page → noindex, nofollow',
    },
    {
      page: 'city (valid, 0 buffets)',
      scenario: 'city exists but has no buffets',
      expected: { index: false, follow: true },
      rule: 'Valid but empty → noindex, follow (preserve link equity)',
    },
    {
      page: 'city (valid, has buffets)',
      scenario: 'normal city page with buffets',
      expected: { index: true, follow: true },
      rule: 'Normal page → index, follow (default)',
    },
    {
      page: 'neighborhood (invalid slug)',
      scenario: 'slug does not match any neighborhood in DB',
      expected: { index: false, follow: false },
      rule: 'Invalid page → noindex, nofollow',
    },
    {
      page: 'neighborhood (valid, 0 buffets)',
      scenario: 'neighborhood exists but has no buffets',
      expected: { index: false, follow: true },
      rule: 'Valid but empty → noindex, follow (preserve link equity)',
    },
    {
      page: 'neighborhood (valid, has buffets)',
      scenario: 'normal neighborhood page with buffets',
      expected: { index: true, follow: true },
      rule: 'Normal page → index, follow (default)',
    },
    {
      page: 'state (invalid abbr)',
      scenario: 'abbreviation not in STATE_ABBR_TO_NAME',
      expected: { index: false, follow: false },
      rule: 'Invalid page → noindex, nofollow',
    },
    {
      page: 'state (valid, 0 cities)',
      scenario: 'state exists but has no cities with buffets',
      expected: { index: false, follow: true },
      rule: 'Valid but empty → noindex, follow (preserve link equity)',
    },
    {
      page: 'state (valid, has cities)',
      scenario: 'normal state page',
      expected: { index: true, follow: true },
      rule: 'Normal page → index, follow (default)',
    },
    {
      page: 'POI (invalid type)',
      scenario: 'slug is not parking/shopping-malls/highways/gas-stations',
      expected: { index: false, follow: false },
      rule: 'Invalid page → noindex, nofollow',
    },
    {
      page: 'POI (quality gate fail)',
      scenario: 'valid type but too few buffets or low content quality',
      expected: { index: false, follow: true },
      rule: 'Valid but low quality → noindex, follow (preserve link equity)',
    },
    {
      page: 'POI (quality gate pass)',
      scenario: 'valid type with sufficient buffets and content',
      expected: { index: true, follow: true },
      rule: 'Normal page → index, follow',
    },
  ];

  return NextResponse.json({
    description: 'Expected robots meta values per page scenario',
    rulesSummary: {
      invalid: 'noindex, nofollow — page should not exist, block everything',
      validEmpty: 'noindex, follow — page exists but has no content, preserve link equity',
      validWithContent: 'index, follow — normal indexable page',
    },
    cases,
  });
}
