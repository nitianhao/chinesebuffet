/**
 * Tests for OSM opening_hours string parser
 * Run with: npx tsx lib/__tests__/osm-opening-hours.test.ts
 */
import { parseOsmOpeningHours, osmHoursToAppFormat } from '../osm-opening-hours';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  PASS: ${message}`);
}

// parseOsmOpeningHours
{
  const r1 = parseOsmOpeningHours('Mo-Sa 10:00-21:00');
  assert(r1.length === 6, 'Mo-Sa produces 6 day entries');
  assert(r1[0].dayIndex === 1, 'Monday = day index 1');
  assert(r1[0].open === 600, 'Mo 10:00 = 600 min');
  assert(r1[0].close === 1260, 'Mo 21:00 = 1260 min');

  const r2 = parseOsmOpeningHours('Mo-Sa 10:00-21:00; Su 11:00-20:00');
  assert(r2.length === 7, 'Mo-Sa + Su = 7 entries');
  const su = r2.find(e => e.dayIndex === 0);
  assert(su?.open === 660, 'Su 11:00 = 660 min');
  assert(su?.close === 1200, 'Su 20:00 = 1200 min');

  const r3 = parseOsmOpeningHours('Mo-Fr 06:00-22:00; Sa-Su 07:00-22:00');
  assert(r3.length === 7, 'Mo-Fr + Sa-Su = 7 entries');

  const r4 = parseOsmOpeningHours('24/7');
  assert(r4.length === 7, '24/7 = 7 entries');
  assert(r4[0].open === 0, '24/7 open = 0');
  assert(r4[0].close === 1440, '24/7 close = 1440');

  const r5 = parseOsmOpeningHours('');
  assert(r5.length === 0, 'empty string = 0 entries');
}

// osmHoursToAppFormat
{
  const app = osmHoursToAppFormat('Mo-Sa 10:00-21:00; Su 11:00-20:00');
  assert(Array.isArray(app), 'returns array');
  const suEntry = app!.find((e: { day: string }) => e.day === 'Sunday');
  assert(suEntry !== undefined, 'has Sunday entry');
  assert(suEntry!.hours === '11:00 - 20:00', 'Sunday hours string formatted correctly');
  const moEntry = app!.find((e: { day: string }) => e.day === 'Monday');
  assert(moEntry?.hours === '10:00 - 21:00', 'Monday hours string');

  const nullResult = osmHoursToAppFormat(null);
  assert(nullResult === null, 'null input returns null');
}

console.log('\nAll tests passed!');
