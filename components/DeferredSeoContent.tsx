'use client';

import { ReactNode } from 'react';
import DeferredClient from './DeferredClient';

interface DeferredSeoContentProps {
  children: ReactNode;
  /** Optional ID for anchor linking */
  id?: string;
  className?: string;
}

/**
 * DeferredSeoContent Component
 * 
 * Wrapper for SEO-enrichment content that doesn't need to be visible
 * immediately but should still be crawlable.
 * 
 * This uses 'idle' priority to render during browser idle time,
 * ensuring it never blocks LCP or initial interactivity.
 * 
 * Typical use cases:
 * - AnswerEngineQA (question/answer structured data)
 * - ModifierVariants (search modifier content)
 * - Additional FAQ sections
 * - Extended local information
 */
export default function DeferredSeoContent({
  children,
  id,
  className = '',
}: DeferredSeoContentProps) {
  return (
    <DeferredClient
      priority="idle"
      minDelay={200}
      id={id}
      className={`deferred-seo-content ${className}`}
      placeholder={null} // No placeholder needed - content appears later
    >
      {children}
    </DeferredClient>
  );
}
