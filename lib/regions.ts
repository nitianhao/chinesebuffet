/**
 * US Census Bureau regions - states by region for buffet directory
 */

export const REGION_STATES: Record<string, string[]> = {
  northeast: ['CT', 'DE', 'MA', 'MD', 'ME', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT'],
  midwest: ['IA', 'IL', 'IN', 'KS', 'MI', 'MN', 'MO', 'ND', 'NE', 'OH', 'SD', 'WI'],
  south: ['AL', 'AR', 'DC', 'FL', 'GA', 'KY', 'LA', 'MS', 'NC', 'SC', 'TN', 'TX', 'VA', 'WV'],
  west: ['AK', 'AZ', 'CA', 'CO', 'HI', 'ID', 'MT', 'NM', 'NV', 'OR', 'UT', 'WA', 'WY'],
};

export const REGION_LABELS: Record<string, string> = {
  northeast: 'Northeast',
  midwest: 'Midwest',
  south: 'South',
  west: 'West',
};

export const VALID_REGIONS = Object.keys(REGION_STATES);
