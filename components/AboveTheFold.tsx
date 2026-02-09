import { ReactNode } from 'react';

interface AboveTheFoldProps {
  children: ReactNode;
  className?: string;
}

/**
 * AboveTheFold Component
 * 
 * Wrapper for critical above-the-fold content that must be server-rendered
 * and available immediately for LCP (Largest Contentful Paint).
 * 
 * Content inside this wrapper:
 * - Is fully server-rendered (no client-side hydration delays)
 * - Should contain the LCP element (usually the H1 or main image)
 * - Should not have any loading states or lazy content
 * 
 * Typical above-the-fold content:
 * - Page title (H1)
 * - Rating summary
 * - Verdict/decision module
 * - Primary CTA buttons
 */
export default function AboveTheFold({ children, className = '' }: AboveTheFoldProps) {
  return (
    <div 
      className={`above-the-fold ${className}`}
      data-lcp-container="true"
    >
      {children}
    </div>
  );
}
