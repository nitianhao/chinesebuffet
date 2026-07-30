// lib/cuisines.test.ts
// Run with: npx tsx lib/cuisines.test.ts
import { CUISINES, cuisineByKey } from './cuisines';

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
}

assert(CUISINES.length >= 2, 'has at least chinese + indian');
assert(CUISINES[0].key === 'chinese', 'chinese is first');
assert(CUISINES.some(c => c.key === 'indian'), 'indian present');
assert(CUISINES.every(c => c.routePrefix.startsWith('/') && !c.routePrefix.endsWith('/')), 'routePrefix is a clean absolute path');
assert(new Set(CUISINES.map(c => c.routePrefix)).size === CUISINES.length, 'routePrefixes are unique');
assert(new Set(CUISINES.map(c => c.key)).size === CUISINES.length, 'keys are unique');
assert(cuisineByKey('indian')?.routePrefix === '/indian-buffets', 'cuisineByKey resolves indian');
assert(cuisineByKey('nope') === undefined, 'cuisineByKey returns undefined for unknown');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
