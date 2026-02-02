export function normalizeSearchText(value: string): string {
  if (!value) return '';
  const withoutDiacritics = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  return withoutDiacritics
    .replace(/[^\x00-\x7F]/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
