export function normalizeName(value: string | undefined): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(restaurant|cuisine|bar|grill|llc|inc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(value: string | undefined): string {
  return normalizeName(value)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
