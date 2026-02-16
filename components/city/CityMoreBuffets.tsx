'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SimpleBuffetLink {
    id: string;
    slug: string;
    name: string;
}

interface CityMoreBuffetsProps {
    buffets: SimpleBuffetLink[];
    cityName: string;
    citySlug: string;
}

export default function CityMoreBuffets({ buffets, cityName, citySlug }: CityMoreBuffetsProps) {
    const [expanded, setExpanded] = useState(false);

    // Default: show only the first 24 links
    const INITIAL_COUNT = 24;
    const visibleBuffets = expanded ? buffets : buffets.slice(0, INITIAL_COUNT);
    const remainingCount = buffets.length - visibleBuffets.length;

    return (
        <nav className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
            <h2 className="text-xl font-bold text-[var(--text)] mb-4">
                More Chinese buffets in {cityName}
            </h2>

            <ul className="columns-2 sm:columns-3 gap-x-4 text-sm text-[var(--accent1)]">
                {visibleBuffets.map((b) => (
                    <li key={b.id} className="mb-1 break-inside-avoid">
                        <Link href={`/chinese-buffets/${citySlug}/${b.slug}`} className="hover:underline line-clamp-1">
                            {b.name}
                        </Link>
                    </li>
                ))}
            </ul>

            {!expanded && remainingCount > 0 && (
                <div className="mt-4">
                    <button
                        onClick={() => setExpanded(true)}
                        className="text-[var(--accent1)] hover:underline font-medium text-sm focus:outline-none"
                        aria-expanded={expanded}
                    >
                        Show all ({buffets.length})
                    </button>
                </div>
            )}
        </nav>
    );
}
