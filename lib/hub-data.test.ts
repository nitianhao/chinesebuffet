// lib/hub-data.test.ts
// Run with: npx tsx lib/hub-data.test.ts
import { mergeCityRollups, mergeStateCuisines } from './hub-data';

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
}

const merged = mergeCityRollups([
  { key: 'chinese', label: 'Chinese', rows: [
    { slug: 'dallas-tx', city: 'Dallas', state: 'TX', buffetCount: 4 },
    { slug: 'reno-nv', city: 'Reno', state: 'NV', buffetCount: 2 },
  ]},
  { key: 'indian', label: 'Indian', rows: [
    { slug: 'dallas-tx', city: 'Dallas', state: 'TX', buffetCount: 3 },
    { slug: 'edison-nj', city: 'Edison', state: 'NJ', buffetCount: 5 },
  ]},
]);

const bySlug = Object.fromEntries(merged.map(r => [r.slug, r]));

assert(merged.length === 3, 'union of slugs across cuisines (dallas, reno, edison)');
assert(bySlug['dallas-tx'].cuisines.length === 2, 'dallas has both cuisines');
assert(bySlug['dallas-tx'].totalCount === 7, 'dallas totalCount sums both (4+3)');
assert(bySlug['reno-nv'].cuisines.length === 1 && bySlug['reno-nv'].cuisines[0].key === 'chinese', 'reno chinese-only');
assert(bySlug['edison-nj'].cuisines[0].key === 'indian', 'edison indian-only');
assert(merged[0].slug === 'dallas-tx', 'sorted by totalCount desc (dallas=7 first: 4 chinese + 3 indian, the max)');
assert(bySlug['dallas-tx'].city === 'Dallas' && bySlug['dallas-tx'].state === 'TX', 'city/state carried through');

// A cuisine reporting zero for a slug must not create an empty availability entry
const zero = mergeCityRollups([
  { key: 'chinese', label: 'Chinese', rows: [{ slug: 'x-tx', city: 'X', state: 'TX', buffetCount: 0 }] },
  { key: 'indian', label: 'Indian', rows: [{ slug: 'x-tx', city: 'X', state: 'TX', buffetCount: 2 }] },
]);
assert(zero[0].cuisines.length === 1 && zero[0].cuisines[0].key === 'indian', 'zero-count cuisine excluded');

// --- mergeStateCuisines: per-state and per-region availability ----------------
const regionStates = {
  south: ['TX', 'FL'],   // TX has both, FL chinese-only
  northeast: ['NJ'],     // NJ indian-only
  west: ['CA'],          // CA has no buffets at all
};
const avail = mergeStateCuisines(
  [
    { key: 'chinese', rows: [
      { stateAbbr: 'TX', buffetCount: 4 },
      { stateAbbr: 'FL', buffetCount: 2 },
      { stateAbbr: 'NJ', buffetCount: 0 }, // zero => not present
    ]},
    { key: 'indian', rows: [
      { stateAbbr: 'tx', buffetCount: 3 }, // lowercase => normalized to TX
      { stateAbbr: 'NJ', buffetCount: 5 },
    ]},
  ],
  regionStates,
);

assert(JSON.stringify(avail.byState['TX']) === JSON.stringify(['chinese', 'indian']), 'TX has both, in CUISINES order');
assert(JSON.stringify(avail.byState['FL']) === JSON.stringify(['chinese']), 'FL chinese-only');
assert(JSON.stringify(avail.byState['NJ']) === JSON.stringify(['indian']), 'NJ indian-only (zero chinese excluded)');
assert(avail.byState['CA'] === undefined, 'state with no buffets absent from byState');
assert(JSON.stringify(avail.byRegion['south']) === JSON.stringify(['chinese', 'indian']), 'south aggregates TX+FL to both cuisines');
assert(JSON.stringify(avail.byRegion['northeast']) === JSON.stringify(['indian']), 'northeast (NJ) indian-only');
assert(JSON.stringify(avail.byRegion['west']) === JSON.stringify([]), 'west (CA) empty when no buffets');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
