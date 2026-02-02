import React from 'react';

interface DividerProps {
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

/**
 * Divider - Subtle visual separator
 * Can be horizontal (default) or vertical
 */
export default function Divider({ className = '', orientation = 'horizontal' }: DividerProps) {
  if (orientation === 'vertical') {
    return <div className={`w-px bg-neutral-200 ${className}`} />;
  }
  
  return <div className={`h-px bg-neutral-200 ${className}`} />;
}
