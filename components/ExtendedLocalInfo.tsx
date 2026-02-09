'use client';

import { useState, useId } from 'react';
import { extractPreviewSummary } from '@/lib/summaryUtils';

interface ExtendedLocalInfoProps {
  title: string;
  fullSummary: string | null | undefined; // Full summary text
  children: React.ReactNode;
  className?: string;
}

/**
 * Extended Local Info Component
 * 
 * For long-tail SEO sections:
 * - Shows 1-2 sentence summary by default
 * - Hides full content behind "Show local details" button
 * - Content remains in DOM for SEO (using sr-only when collapsed)
 * - Ensures crawlers can always see the full content
 */
export default function ExtendedLocalInfo({
  title,
  fullSummary,
  children,
  className = '',
}: ExtendedLocalInfoProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const sectionId = useId();
  const contentId = `${sectionId}-content`;
  const buttonId = `${sectionId}-button`;

  // Extract 1-2 sentence preview from full summary
  const previewSummary = extractPreviewSummary(fullSummary, 2);

  return (
    <div className={`mb-6 ${className}`}>
      {/* Section Header */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full font-medium">
            Extended local info
          </span>
        </div>
        {previewSummary && (
          <p className="text-sm text-gray-700 leading-relaxed">{previewSummary}</p>
        )}
      </div>

      {/* Toggle Button */}
      <button
        id={buttonId}
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 mb-3 transition-colors"
      >
        <span>{isExpanded ? 'Hide' : 'Show'} local details</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
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

      {/* Full Content - Always in DOM for SEO */}
      <div
        id={contentId}
        className={`${
          isExpanded
            ? 'block'
            : 'sr-only' // Screen reader only when collapsed - keeps content in DOM for SEO
        }`}
        aria-hidden={!isExpanded}
      >
        {children}
      </div>
    </div>
  );
}
