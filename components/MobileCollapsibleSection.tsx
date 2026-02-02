'use client';

import { useState, useId } from 'react';

interface MobileCollapsibleSectionProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  priority?: 'high' | 'medium' | 'low';
  className?: string;
}

/**
 * Mobile Collapsible Section
 * 
 * On mobile: Low-priority sections are collapsed by default
 * On desktop: All sections are expanded
 * 
 * Provides:
 * - Section divider with icon
 * - Collapsible content on mobile
 * - Increased spacing
 */
export default function MobileCollapsibleSection({
  id,
  title,
  icon,
  children,
  defaultExpanded = false,
  priority = 'medium',
  className = '',
}: MobileCollapsibleSectionProps) {
  const sectionId = useId();
  const contentId = `${sectionId}-content`;
  const buttonId = `${sectionId}-button`;

  // Determine if section should be collapsible
  // Never collapsible if defaultExpanded is true or priority is high
  const isAlwaysExpanded = defaultExpanded === true || priority === 'high';
  
  // On mobile, low-priority sections start collapsed
  // Use useState with initial value based on priority and screen size
  const [isExpandedState, setIsExpandedState] = useState(() => {
    if (isAlwaysExpanded) return true;
    if (priority === 'low') return false;
    return defaultExpanded;
  });
  
  // Only collapse if priority is low AND not always expanded
  const shouldStartCollapsed = priority === 'low' && !isAlwaysExpanded;

  return (
    <section
      id={id}
      className={`scroll-mt-24 ${className}`}
    >
      {/* Section Divider with Icon and Title */}
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex items-center justify-center">
          <div className="bg-white px-4 flex items-center gap-3">
            {icon && (
              <div className="text-gray-400">
                {icon}
              </div>
            )}
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          </div>
        </div>
      </div>

      {/* Mobile: Collapsible Button (only for low-priority sections) */}
      {shouldStartCollapsed && (
        <div className="md:hidden mb-4">
          <button
            id={buttonId}
            type="button"
            onClick={() => setIsExpandedState(!isExpandedState)}
            aria-expanded={isExpandedState}
            aria-controls={contentId}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
          >
            <span className="text-sm font-medium text-gray-700">
              {isExpandedState ? 'Hide' : 'Show'} {title}
            </span>
            <svg
              className={`w-5 h-5 text-gray-600 transition-transform duration-200 ${
                isExpandedState ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Content */}
      <div
        id={contentId}
        className={
          isAlwaysExpanded
            ? 'block'
            : shouldStartCollapsed
            ? `md:block ${
                isExpandedState
                  ? 'block max-h-none opacity-100'
                  : 'hidden max-h-0 opacity-0'
              } transition-all duration-300 ease-in-out`
            : 'block'
        }
      >
        {children}
      </div>
    </section>
  );
}
