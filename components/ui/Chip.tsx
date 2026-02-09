import React from 'react';

interface ChipProps {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'success' | 'error' | 'warning';
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Chip - Professional badge component with warm neutral palette
 * Used for categories, tags, status indicators
 */
export default function Chip({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
}: ChipProps) {
  const variants = {
    // Warm neutral default
    default: 'bg-[var(--surface2)] text-[var(--muted)] ring-1 ring-[var(--border)]',
    // Red accent - subtle tint
    accent: 'bg-[#C1121F]/8 text-[#C1121F] ring-1 ring-[#C1121F]/20',
    // Muted green (doesn't fight red)
    success: 'bg-emerald-50/80 text-emerald-700 ring-1 ring-emerald-200/60',
    // Amber for warnings
    warning: 'bg-amber-50/80 text-amber-700 ring-1 ring-amber-200/60',
    // Muted red for errors/closed
    error: 'bg-[#C1121F]/6 text-[#C1121F] ring-1 ring-[#C1121F]/15',
  };

  const sizes = {
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  );
}
