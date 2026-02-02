'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import ModalDrawer from '@/components/ui/ModalDrawer';
import SearchBar from '@/components/SearchBar';

const navLinks = [
  { label: 'Cities', href: '/' },
  { label: 'States', href: '/chinese-buffets/states' },
  { label: 'Neighborhoods', href: '/chinese-buffets/near/shopping-malls' },
];


/** Brand mark: Chinese character "中" (middle/Chinese) on black square - matches favicon */
function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-black text-[#FF0000] font-bold select-none ${className}`}
      aria-hidden="true"
    >
      中
    </span>
  );
}

/** Header nav pill for dark background */
function HeaderNavPill({
  href,
  label,
  isActive = false,
}: {
  href: string;
  label: string;
  isActive?: boolean;
}) {
  const baseClasses =
    'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]';
  const activeClasses = 'border-[#C1121F]/40 bg-[#C1121F]/15 text-white';
  const idleClasses =
    'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white';

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`${baseClasses} ${isActive ? activeClasses : idleClasses}`}
    >
      {label}
    </Link>
  );
}

/** Header icon button for dark background */
function HeaderIconButton({
  label,
  children,
  onClick,
  ariaExpanded,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]"
    >
      {children}
    </button>
  );
}

export default function Header() {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const updateScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };
    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });
    return () => window.removeEventListener('scroll', updateScroll);
  }, []);

  useEffect(() => {
    setIsSearchOpen(false);
    setIsMenuOpen(false);
  }, [pathname]);

  const headerClasses = [
    'sticky top-0 z-[9999] w-full border-b backdrop-blur-xl transition',
    isScrolled
      ? 'bg-[#0B0B0C]/95 border-white/10 shadow-lg'
      : 'bg-[#0B0B0C]/90 border-white/5 shadow-md',
  ].join(' ');

  return (
    <header className={headerClasses}>
      <div className="relative">
        {/* Subtle red gradient hairline */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[1px] opacity-50"
          style={{
            background:
              'linear-gradient(90deg, #C1121F, #7F0A12 50%, transparent)',
          }}
        />

        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center justify-between gap-3 md:h-16">
            {/* Left: Brand + Nav */}
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="flex items-center gap-2.5 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F] rounded-md"
              >
                <BrandMark className="h-8 w-8 text-base" />
                <span className="text-sm font-semibold text-white sm:text-base">
                  <span className="hidden sm:inline">
                    Chinese Buffet Directory
                  </span>
                  <span className="sm:hidden">Chinese Buffet</span>
                </span>
              </Link>

              {/* Desktop nav pills */}
              <div className="hidden lg:flex items-center gap-2 ml-2">
                {navLinks.map((link) => (
                  <HeaderNavPill
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    isActive={pathname === link.href}
                  />
                ))}
              </div>
            </div>

            {/* Center: Search (desktop) */}
            <div className="hidden md:flex flex-1 justify-center px-4">
              <div className="relative w-full max-w-xl">
                <SearchBar />
              </div>
            </div>

            {/* Right: CTA + Mobile controls */}
            <div className="flex items-center gap-2">
              {/* Primary CTA - Red gradient */}
              <Link
                href="/#submit"
                className="inline-flex items-center rounded-full bg-gradient-to-r from-[#C1121F] to-[#7F0A12] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:shadow-md hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F] sm:px-4 sm:text-sm"
              >
                Add a buffet
              </Link>

              {/* Mobile controls */}
              <div className="flex items-center gap-2 md:hidden">
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/70 shadow-sm transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]"
                  aria-label="Open search"
                  aria-expanded={isSearchOpen}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  Search
                </button>
                <HeaderIconButton
                  label="Open menu"
                  onClick={() => setIsMenuOpen(true)}
                  ariaExpanded={isMenuOpen}
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </HeaderIconButton>
              </div>
            </div>
          </div>
        </div>

        {/* Tablet nav row */}
        <div className="hidden md:block lg:hidden border-t border-white/5">
          <div className="container mx-auto px-4 py-2">
            <nav className="flex flex-wrap items-center gap-2">
              {navLinks.map((link) => (
                <HeaderNavPill
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  isActive={pathname === link.href}
                />
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Mobile Search Drawer */}
      <ModalDrawer
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        title="Search"
        side="top"
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">Search</h2>
            <button
              type="button"
              aria-label="Close search"
              onClick={() => setIsSearchOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface2)] text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="relative">
            <SearchBar
              variant="mobile"
              autoFocus
              onNavigate={() => setIsSearchOpen(false)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Quick links
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                Popular cities
              </Link>
              <Link
                href="/chinese-buffets/states"
                className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                States
              </Link>
              <Link
                href="/chinese-buffets/near/parking"
                className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                Near me
              </Link>
            </div>
          </div>
        </div>
      </ModalDrawer>

      {/* Mobile Menu Drawer */}
      <ModalDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        title="Navigation"
        side="right"
      >
        <div className="flex h-full flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrandMark className="h-7 w-7 text-sm" />
              <h2 className="text-lg font-semibold text-[var(--text)]">Menu</h2>
            </div>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setIsMenuOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface2)] text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <nav className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-sm font-medium text-[var(--muted)] shadow-sm transition hover:bg-[var(--surface)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto">
            <Link
              href="/#submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#C1121F] to-[#7F0A12] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]"
            >
              Add a buffet
            </Link>
          </div>
        </div>
      </ModalDrawer>
    </header>
  );
}
