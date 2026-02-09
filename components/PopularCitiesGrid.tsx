'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface CityItem {
  slug: string;
  city: string;
  state: string;
  buffetCount: number;
}

export default function PopularCitiesGrid() {
  const [cities, setCities] = useState<CityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/cities')
      .then((res) => res.json())
      .then((data) => {
        if (data?.cities?.length) setCities(data.cities.slice(0, 12));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading || cities.length === 0) return null;

  return (
    <section id="popular-cities" className="bg-[var(--bg)] py-8" aria-labelledby="popular-cities-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="popular-cities-heading" className="text-xl font-bold text-[var(--text)] mb-4">
          Popular Cities
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {cities.map((c) => (
            <Link
              key={c.slug}
              href={`/chinese-buffets/${c.slug}`}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2"
            >
              <span className="block truncate">{c.city}</span>
              <span className="block text-[var(--muted)] text-xs mt-0.5">{c.buffetCount} buffets</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
