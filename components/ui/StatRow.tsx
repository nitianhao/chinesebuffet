import React from 'react';

interface StatItemProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
  className?: string;
}

/**
 * StatItem - Single stat display (label + value)
 * Compact, dense, mobile-first
 */
export function StatItem({ label, value, icon, href, className = '' }: StatItemProps) {
  const content = (
    <>
      {icon && <div className="flex-shrink-0 text-gray-400">{icon}</div>}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 mb-0.5">{label}</div>
        <div className="text-sm text-gray-900 font-medium break-words">{value}</div>
      </div>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className={`flex items-start gap-3 py-2 hover:bg-gray-50 rounded-md transition-colors ${className}`}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      >
        {content}
      </a>
    );
  }

  return (
    <div className={`flex items-start gap-3 py-2 ${className}`}>
      {content}
    </div>
  );
}

interface StatRowProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * StatRow - Container for multiple StatItems
 * Provides consistent spacing and dividers
 */
export default function StatRow({ children, className = '' }: StatRowProps) {
  return (
    <div className={`divide-y divide-gray-100 ${className}`}>
      {children}
    </div>
  );
}
