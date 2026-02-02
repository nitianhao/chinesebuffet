'use client';

import Link from 'next/link';
import React from 'react';

interface IconButtonProps {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
  /** Use dark variant for black header */
  variant?: 'light' | 'dark';
}

export default function IconButton({
  label,
  children,
  onClick,
  href,
  className = '',
  ariaExpanded,
  ariaControls,
  variant = 'light',
}: IconButtonProps) {
  const baseClasses =
    'inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]';

  const variantClasses = {
    light:
      'border-[var(--border)] bg-[var(--surface2)] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]',
    dark:
      'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${className}`;
  const ariaProps = {
    'aria-label': label,
    ...(ariaExpanded !== undefined ? { 'aria-expanded': ariaExpanded } : {}),
    ...(ariaControls ? { 'aria-controls': ariaControls } : {}),
  };

  if (href) {
    return (
      <Link href={href} {...ariaProps} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" {...ariaProps} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
