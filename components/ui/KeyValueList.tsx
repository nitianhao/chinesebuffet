import React from 'react';

interface KeyValueItem {
  label: string;
  value: string | React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
}

interface KeyValueListProps {
  items: KeyValueItem[];
  columns?: 1 | 2;
  dense?: boolean;
  className?: string;
}

/**
 * KeyValueList - Dense label/value rows component
 * Features: optional icons, links, 1-2 column layout
 */
export default function KeyValueList({
  items,
  columns = 1,
  dense = false,
  className = '',
}: KeyValueListProps) {
  const gridClass = columns === 2 ? 'grid grid-cols-1 md:grid-cols-2 gap-x-6' : '';
  const spacingClass = dense ? 'space-y-2' : 'space-y-3';

  return (
    <div className={`${gridClass} ${spacingClass} ${className}`}>
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          {item.icon && (
            <div className="flex-shrink-0 text-[var(--muted-light)] mt-0.5">
              {item.icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <dt className={`text-[var(--muted)] ${dense ? 'text-xs' : 'text-sm'}`}>
              {item.label}
            </dt>
            <dd className={`text-[var(--text)] font-medium mt-0.5 ${dense ? 'text-sm' : 'text-base'}`}>
              {item.href ? (
                <a
                  href={item.href}
                  className="text-[#C1121F] hover:text-[#7F0A12] hover:underline"
                  target={item.href.startsWith('http') ? '_blank' : undefined}
                  rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                >
                  {item.value}
                </a>
              ) : (
                item.value
              )}
            </dd>
          </div>
        </div>
      ))}
    </div>
  );
}
