import React from 'react';

interface IconLabelProps {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  href?: string;
  className?: string;
}

/**
 * IconLabel - Icon + label + value for compact lists
 * Uses min-w-0 and flex-1 for even width in grid layouts
 */
export default function IconLabel({
  icon,
  label,
  value,
  href,
  className = '',
}: IconLabelProps) {
  const content = (
    <>
      {icon && <div className="shrink-0 text-neutral-400">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
        <div className="text-sm font-medium text-neutral-900 truncate">{value}</div>
      </div>
    </>
  );

  const baseClass = 'flex items-center gap-2 min-w-0 w-full';
  if (href) {
    return (
      <a href={href} className={`${baseClass} ${className}`}>
        {content}
      </a>
    );
  }

  return <div className={`${baseClass} ${className}`}>{content}</div>;
}
