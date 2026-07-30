export function normalizeDomain(value: string | undefined): string {
  if (!value) return '';

  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}
