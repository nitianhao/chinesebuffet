import Link from 'next/link';
import { getCuisineBasePath, getCuisineNoun } from '@/lib/cuisine';

interface SimpleBuffetLink {
    id: string;
    slug: string;
    name: string;
}

interface CityMoreBuffetsProps {
    buffets: SimpleBuffetLink[];
    cityName: string;
    citySlug: string;
    cuisineType?: string | null;
}

export default function CityMoreBuffets({ buffets, cityName, citySlug, cuisineType }: CityMoreBuffetsProps) {
    const INITIAL_COUNT = 24;
    const visibleBuffets = buffets.slice(0, INITIAL_COUNT);
    const overflowBuffets = buffets.slice(INITIAL_COUNT);
    const basePath = getCuisineBasePath(cuisineType);
    const cuisineNoun = getCuisineNoun(cuisineType);

    return (
        <nav className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
            <h2 className="text-xl font-bold text-[var(--text)] mb-4">
                More {cuisineNoun} buffets in {cityName}
            </h2>

            <ul className="columns-2 sm:columns-3 gap-x-4 text-sm text-[var(--accent1)]">
                {visibleBuffets.map((b) => (
                    <li key={b.id} className="mb-1 break-inside-avoid">
                        <Link href={`${basePath}/${citySlug}/${b.slug}`} className="hover:underline line-clamp-1">
                            {b.name}
                        </Link>
                    </li>
                ))}
            </ul>

            {overflowBuffets.length > 0 && (
                <details className="mt-4 group">
                    <summary className="cursor-pointer text-[var(--accent1)] hover:underline font-medium text-sm focus:outline-none">
                        Show all ({buffets.length})
                    </summary>
                    <ul className="columns-2 sm:columns-3 gap-x-4 text-sm text-[var(--accent1)] mt-3">
                        {overflowBuffets.map((b) => (
                            <li key={b.id} className="mb-1 break-inside-avoid">
                                <Link href={`${basePath}/${citySlug}/${b.slug}`} className="hover:underline line-clamp-1">
                                    {b.name}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </nav>
    );
}
