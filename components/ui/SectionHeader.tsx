import React from 'react';

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  level?: 2 | 3 | 4;
  className?: string;
}

/**
 * SectionHeader - Consistent section title with optional description and action
 * Features: h2/h3/h4 support, optional icon, right-side action slot
 */
export default function SectionHeader({
  title,
  description,
  action,
  icon,
  level = 2,
  className = '',
}: SectionHeaderProps) {
  const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
  
  const titleSizes = {
    2: 'text-lg md:text-xl',
    3: 'text-base md:text-lg',
    4: 'text-sm md:text-base',
  };

  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {icon && (
            <div className="flex-shrink-0 text-neutral-400">
              {icon}
            </div>
          )}
          <HeadingTag className={`font-semibold text-neutral-900 tracking-tight ${titleSizes[level]}`}>
            {title}
          </HeadingTag>
        </div>
        {description && (
          <p className="mt-1 text-sm text-neutral-600">
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}
