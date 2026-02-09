import Link from 'next/link';

const REGIONS = [
  { slug: 'northeast', label: 'Northeast' },
  { slug: 'midwest', label: 'Midwest' },
  { slug: 'south', label: 'South' },
  { slug: 'west', label: 'West' },
] as const;

export default function BuffetsByRegion() {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-[var(--text)] mb-3">
        Buffets by region
      </h3>
      <ul className="flex flex-wrap gap-3" role="list">
        {REGIONS.map((r) => (
          <li key={r.slug}>
            <Link
              href={`/chinese-buffets/regions/${r.slug}`}
              className="inline-flex items-center px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm font-medium hover:border-[var(--accent1)] hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2"
            >
              {r.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
