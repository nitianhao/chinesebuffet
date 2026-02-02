import React from 'react';

interface InlineMeterProps {
  label: string;
  value: number;
  max?: number;
  color?: 'red' | 'green' | 'yellow' | 'amber' | 'gray';
  showValue?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * InlineMeter - Small bar for scores and ratings
 * Features: customizable color, optional value display
 */
export default function InlineMeter({
  label,
  value,
  max = 5,
  color = 'red',
  showValue = true,
  size = 'sm',
  className = '',
}: InlineMeterProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const colors = {
    red: 'bg-[#C1121F]',
    green: 'bg-emerald-600',
    yellow: 'bg-yellow-500',
    amber: 'bg-amber-500',
    gray: 'bg-gray-500',
  };

  const heights = {
    sm: 'h-1.5',
    md: 'h-2',
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex-shrink-0 text-[var(--text)] font-medium ${textSizes[size]} min-w-[80px]`}>
        {label}
      </div>
      <div className={`flex-1 bg-[var(--surface2)] rounded-full ${heights[size]} overflow-hidden`}>
        <div
          className={`${heights[size]} ${colors[color]} rounded-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showValue && (
        <div className={`flex-shrink-0 text-[var(--muted)] font-medium ${textSizes[size]} min-w-[32px] text-right`}>
          {value.toFixed(1)}
        </div>
      )}
    </div>
  );
}
