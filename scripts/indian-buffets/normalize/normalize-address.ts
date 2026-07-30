import { normalizeName } from './normalize-name';

export function normalizeAddress(value: string | undefined): string {
  return normalizeName(value)
    .replace(/\b(street|str)\b/g, 'st')
    .replace(/\b(avenue)\b/g, 'ave')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(boulevard)\b/g, 'blvd')
    .replace(/\b(drive)\b/g, 'dr')
    .replace(/\b(lane)\b/g, 'ln')
    .replace(/\b(suite|ste)\b/g, 'ste')
    .replace(/\s+/g, ' ')
    .trim();
}
