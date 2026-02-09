'use client';

import Link from 'next/link';
import SiteShell from '@/components/layout/SiteShell';
import SaveButton from '@/components/saved/SaveButton';
import { useSavedBuffets } from '@/components/saved/useSavedBuffets';

export default function SavedPage() {
  const { saved } = useSavedBuffets();

  return (
    <SiteShell>
      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <h1 className="text-xl font-semibold text-[var(--text)]">Saved buffets</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Your saved places are stored on this device.
        </p>
      </section>

      {saved.length === 0 ? (
        <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)] text-center">
          <h2 className="text-lg font-semibold text-[var(--text)]">No saved buffets yet</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Tap the save icon on any buffet card or detail page to add it here.
          </p>
          <Link
            href="/chinese-buffets/states"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface2)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface)]"
          >
            Browse buffets
          </Link>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4">
          {saved.map((buffet) => (
            <div
              key={`${buffet.citySlug}-${buffet.slug}`}
              className="relative rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="absolute right-3 top-3">
                <SaveButton item={buffet} />
              </div>
              <Link
                href={`/chinese-buffets/${buffet.citySlug}/${buffet.slug}`}
                className="block pr-12"
              >
                <h2 className="text-base font-semibold text-[var(--text)] line-clamp-2">
                  {buffet.name}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {buffet.city}, {buffet.stateAbbr}
                </p>
                {(buffet.rating || buffet.reviewCount) && (
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {buffet.rating ? `★ ${buffet.rating.toFixed(1)}` : '★ —'}
                    {buffet.reviewCount ? ` · ${buffet.reviewCount.toLocaleString()} reviews` : ''}
                    {buffet.price ? ` · ${buffet.price}` : ''}
                  </p>
                )}
              </Link>
            </div>
          ))}
        </section>
      )}
    </SiteShell>
  );
}
