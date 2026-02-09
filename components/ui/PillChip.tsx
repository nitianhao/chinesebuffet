import React from 'react';

interface PillChipProps {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'success' | 'error' | 'muted';
  className?: string;
}

/**
 * PillChip - Signature pill chip with warm neutral palette
 */
export default function PillChip({
  children,
  variant = 'default',
  className = '',
}: PillChipProps) {
  const variants = {
    // Warm neutral
    default: 'bg-[var(--surface2)] text-[var(--muted)] ring-1 ring-[var(--border)]',
    // Subtle glass
    muted: 'bg-white/70 text-[var(--muted)] ring-1 ring-[var(--border)]',
    // Red accent - subtle tint
    accent: 'bg-[#C1121F]/8 text-[#C1121F] ring-1 ring-[#C1121F]/20',
    // Muted green
    success: 'bg-emerald-50/80 text-emerald-700 ring-1 ring-emerald-200/60',
    // Muted red
    error: 'bg-[#C1121F]/6 text-[#C1121F] ring-1 ring-[#C1121F]/15',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
