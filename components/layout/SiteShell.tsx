import React from 'react';

type SiteShellProps = {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  contentClassName?: string;
};

const cx = (...classes: Array<string | undefined>) => classes.filter(Boolean).join(' ');

export default function SiteShell({
  children,
  className,
  containerClassName,
  contentClassName,
}: SiteShellProps) {
  return (
    <main className={cx('min-h-screen bg-[var(--bg)] text-[var(--text)]', className)}>
      <div
        className={cx(
          'mx-auto w-full max-w-[var(--page-max-w)] px-[var(--page-x)]',
          containerClassName
        )}
      >
        <div
          className={cx(
            'py-[var(--page-y)] space-y-[var(--section-gap)]',
            contentClassName
          )}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
