'use client';

import Link from 'next/link';

interface NavPillProps {
  href: string;
  label: string;
  isActive?: boolean;
  className?: string;
}

/**
 * NavPill - For light backgrounds (page content, sidebar, etc.)
 * For dark header, use HeaderNavPill inside Header.tsx
 */
export default function NavPill({ href, label, isActive = false, className = '' }: NavPillProps) {
  const baseClasses =
    'inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]';
  // Active: subtle red tint
  const activeClasses =
    'border-[#C1121F]/25 bg-[#C1121F]/8 text-[#C1121F]';
  // Idle: warm neutral
  const idleClasses =
    'border-[var(--border)] bg-[var(--surface2)] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]';

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`${baseClasses} ${isActive ? activeClasses : idleClasses} ${className}`}
    >
      {label}
    </Link>
  );
}
