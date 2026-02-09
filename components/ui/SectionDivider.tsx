import React from 'react';

interface SectionDividerProps {
  className?: string;
}

/**
 * SectionDivider - Thin gradient divider
 */
export default function SectionDivider({ className = '' }: SectionDividerProps) {
  return (
    <div
      className={`h-px w-full bg-gradient-to-r from-[color:var(--accent1)]/60 via-[color:var(--accent2)]/50 to-transparent ${className}`}
    />
  );
}
