/**
 * Parser for OSM opening_hours strings.
 *
 * OSM format reference: https://wiki.openstreetmap.org/wiki/Key:opening_hours
 * Examples:
 *   "Mo-Sa 10:00-21:00"
 *   "Mo-Sa 10:00-21:00; Su 11:00-20:00"
 *   "Mo-Fr 06:00-22:00; Sa-Su 07:00-22:00"
 *   "24/7"
 */

const OSM_DAY_ABBRS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayAbbrToIndex(abbr: string): number | null {
  const idx = OSM_DAY_ABBRS.indexOf(abbr);
  return idx === -1 ? null : idx;
}

function expandDayRange(rangeStr: string): number[] {
  const trimmed = rangeStr.trim();
  if (trimmed.includes('-')) {
    const [startAbbr, endAbbr] = trimmed.split('-').map(s => s.trim());
    const start = dayAbbrToIndex(startAbbr);
    const end = dayAbbrToIndex(endAbbr);
    if (start === null || end === null) return [];
    const indices: number[] = [];
    if (end >= start) {
      for (let i = start; i <= end; i++) indices.push(i);
    } else {
      for (let i = start; i <= 6; i++) indices.push(i);
      for (let i = 0; i <= end; i++) indices.push(i);
    }
    return indices;
  }
  const single = dayAbbrToIndex(trimmed);
  return single !== null ? [single] : [];
}

function timeStrToMinutes(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export interface OsmHoursEntry {
  dayIndex: number;
  open: number;
  close: number;
}

export function parseOsmOpeningHours(raw: string | null | undefined): OsmHoursEntry[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed === '24/7') {
    return DAY_NAMES.map((_, i) => ({ dayIndex: i, open: 0, close: 1440 }));
  }
  const entries: OsmHoursEntry[] = [];
  const segments = trimmed.split(';').map(s => s.trim()).filter(Boolean);
  for (const segment of segments) {
    const spaceIdx = segment.search(/\s/);
    if (spaceIdx === -1) continue;
    const dayPart = segment.slice(0, spaceIdx).trim();
    const timePart = segment.slice(spaceIdx + 1).trim();
    if (dayPart === 'PH' || dayPart === 'SH') continue;
    const timeMatch = timePart.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    if (!timeMatch) continue;
    const open = timeStrToMinutes(timeMatch[1]);
    let close = timeStrToMinutes(timeMatch[2]);
    if (open === null || close === null) continue;
    if (close < open) close += 1440;
    const dayGroups = dayPart.split(',');
    for (const group of dayGroups) {
      const dayIndices = expandDayRange(group.trim());
      for (const dayIndex of dayIndices) {
        entries.push({ dayIndex, open, close });
      }
    }
  }
  return entries;
}

function minutesToTimeStr(minutes: number): string {
  const m = minutes % 1440;
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const min = (m % 60).toString().padStart(2, '0');
  return `${h}:${min}`;
}

export function osmHoursToAppFormat(
  raw: string | null | undefined
): Array<{ day: string; hours: string }> | null {
  const entries = parseOsmOpeningHours(raw);
  if (entries.length === 0) return null;
  const seen = new Set<number>();
  const result: Array<{ day: string; hours: string }> = [];
  for (const entry of entries) {
    if (seen.has(entry.dayIndex)) continue;
    seen.add(entry.dayIndex);
    result.push({
      day: DAY_NAMES[entry.dayIndex],
      hours: `${minutesToTimeStr(entry.open)} - ${minutesToTimeStr(entry.close)}`,
    });
  }
  result.sort((a, b) => DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day));
  return result;
}
