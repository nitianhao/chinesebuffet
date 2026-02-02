import Link from 'next/link';

interface BreadcrumbItem {
  name: string;
  url: string;
  icon?: boolean; // If true, render as home icon instead of text
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

/**
 * Breadcrumb Component
 * 
 * Displays navigation breadcrumbs for hierarchical page navigation.
 * Shows the path from home to the current page.
 */
export default function Breadcrumb({ items }: BreadcrumbProps) {
  if (!items || items.length === 0) {
    return null;
  }

  // Filter out invalid items
  const validItems = items.filter(item => item && item.name && item.url);

  if (validItems.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex items-center flex-wrap gap-2 text-sm text-[var(--muted)]">
        {validItems.map((item, index) => {
          const isLast = index === validItems.length - 1;
          const showSeparator = index > 0;
          
          return (
            <li key={`${item.url}-${index}`} className="flex items-center">
              {showSeparator && (
                <svg
                  className="w-4 h-4 text-[var(--muted-light)] mx-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              )}
              {isLast ? (
                <span className="text-[var(--text)] font-medium" aria-current="page">
                  {item.name}
                </span>
              ) : item.icon ? (
                <Link
                  href={item.url || '/'}
                  className="hover:text-[#C1121F] transition-colors"
                  aria-label="Home"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    />
                  </svg>
                </Link>
              ) : (
                <Link
                  href={item.url || '#'}
                  className="hover:text-[#C1121F] hover:underline transition-colors"
                >
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
