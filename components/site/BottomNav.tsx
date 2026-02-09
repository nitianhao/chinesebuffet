'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import MobileSearchDrawer from '@/components/search/MobileSearchDrawer';

type NavItem = {
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  {
    label: 'Home',
    href: '/',
    isActive: (pathname) => pathname === '/',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-10.5z"
        />
      </svg>
    ),
  },
  {
    label: 'Browse',
    href: '/chinese-buffets/states',
    isActive: (pathname) => pathname.startsWith('/chinese-buffets'),
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 6h16M4 12h16M4 18h10"
        />
      </svg>
    ),
  },
  {
    label: 'Search',
    href: '/search',
    isActive: (pathname) => pathname.startsWith('/search'),
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    ),
  },
  {
    label: 'Saved',
    href: '/saved',
    isActive: (pathname) => pathname.startsWith('/saved'),
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 4h12a1 1 0 011 1v16l-7-4-7 4V5a1 1 0 011-1z"
        />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname() || '/';
  const isBuffetDetail =
    pathname.startsWith('/chinese-buffets/') &&
    pathname.split('/').length === 4 &&
    !pathname.endsWith('/neighborhoods');

  if (isBuffetDetail) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[9998] border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl md:hidden"
      aria-label="Primary"
    >
      <div
        className="mx-auto flex w-full max-w-[var(--page-max-w)] items-center justify-around px-3"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {navItems.map((item) => {
          const active = item.isActive(pathname);
          const classes = `flex min-w-[64px] flex-col items-center gap-1 py-3 text-xs font-medium ${
            active
              ? 'text-[var(--accent1)]'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`;

          if (item.label === 'Search') {
            return (
              <MobileSearchDrawer
                key={item.href}
                triggerAriaLabel="Open search"
                placeholder="Search City, Neighborhood, Buffets"
                triggerClassName={classes}
                triggerChildren={
                  <>
                    <span className={active ? 'text-[var(--accent1)]' : 'text-[var(--muted)]'}>
                      {item.icon}
                    </span>
                    {item.label}
                  </>
                }
              />
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={classes}
            >
              <span className={active ? 'text-[var(--accent1)]' : 'text-[var(--muted)]'}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
