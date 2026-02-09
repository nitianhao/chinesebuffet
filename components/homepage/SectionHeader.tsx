import { h2 } from '@/lib/layout-utils';

/**
 * Section header for homepage: title (h2) + optional action link.
 * Server component; no "use client".
 * Layout: flex row, items-baseline justify-between; link aligns with title.
 */

interface SectionHeaderProps {
  title: string;
  /** Optional "View all ..." link */
  actionHref?: string;
  actionLabel?: string;
}

export default function SectionHeader({
  title,
  actionHref,
  actionLabel,
}: SectionHeaderProps) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-4">
      <h2 className={`${h2} text-[var(--text)]`}>
        {title}
      </h2>
      {actionHref != null && actionLabel != null && (
        <a
          href={actionHref}
          className="text-sm font-medium text-[var(--accent1)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2 focus:ring-offset-[var(--bg)] rounded"
        >
          {actionLabel}
        </a>
      )}
    </div>
  );
}
