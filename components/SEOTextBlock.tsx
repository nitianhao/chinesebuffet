import Link from 'next/link';

interface SEOTextBlockProps {
  lastUpdated?: string | null;
}

export default function SEOTextBlock({ lastUpdated }: SEOTextBlockProps) {
  const formattedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <section
      id="about"
      className="bg-[var(--surface)] border-t border-[var(--border)] py-10"
      aria-labelledby="seo-heading"
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="seo-heading" className="text-2xl font-bold text-[var(--text)] mb-4">
          Find All-You-Can-Eat Chinese Buffets in the USA
        </h2>
        <div className="prose prose-neutral dark:prose-invert max-w-none text-[var(--text)]">
          <p className="text-[var(--muted)] leading-relaxed mb-4">
            This directory helps you discover all-you-can-eat Chinese buffets across the United States.
            Whether you&apos;re planning a family dinner or looking for a quick lunch near work, you can
            browse by <Link href="/chinese-buffets/states" className="text-[var(--accent1)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2 rounded">state</Link>,{' '}
            <Link href="/cities" className="text-[var(--accent1)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2 rounded">city</Link>, or
            neighborhood to find options in your area.
          </p>
          <p className="text-[var(--muted)] leading-relaxed mb-4">
            Listings are ranked by customer ratings, review counts, and distance. Buffets with higher
            ratings and more reviews appear first, so you can quickly spot the most popular spots.
            Each listing includes hours, prices, and directions to help you plan your visit.
          </p>
          <p className="text-[var(--muted)] leading-relaxed">
            Many city pages include neighborhood links, so you can narrow your search to specific
            areas like downtown or the suburbs. Use the search bar above to find buffets by name or
            location.
          </p>
        </div>
        {formattedDate && (
          <p className="mt-6 text-sm text-[var(--muted)]">
            Last updated: {formattedDate}
          </p>
        )}
      </div>
    </section>
  );
}
