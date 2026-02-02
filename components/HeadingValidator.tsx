'use client';

import { useEffect } from 'react';
import { validateHeadingHierarchy, HeadingNode } from '@/lib/heading-validator';

interface HeadingValidatorProps {
  h1Text: string;
  enabled?: boolean;
}

/**
 * Runtime heading validator component
 * Validates heading hierarchy in development mode
 */
export default function HeadingValidator({ h1Text, enabled = process.env.NODE_ENV === 'development' }: HeadingValidatorProps) {
  useEffect(() => {
    if (!enabled) return;

    // Extract all headings from the DOM
    const headings: HeadingNode[] = [];
    
    // Get H1
    const h1 = document.querySelector('h1');
    if (h1) {
      headings.push({
        level: 1,
        text: h1.textContent?.trim() || '',
        id: h1.id || undefined,
      });
    }

    // Get all H2-H4
    for (let level = 2; level <= 4; level++) {
      const elements = document.querySelectorAll(`h${level}`);
      elements.forEach((el) => {
        headings.push({
          level: level as 2 | 3 | 4,
          text: el.textContent?.trim() || '',
          id: el.id || undefined,
        });
      });
    }

    // Validate
    const result = validateHeadingHierarchy(headings);

    if (!result.valid || result.errors.length > 0 || result.warnings.length > 0) {
      console.group('⚠️ Heading Hierarchy Validation');
      if (result.errors.length > 0) {
        console.error('Errors:', result.errors);
      }
      if (result.warnings.length > 0) {
        console.warn('Warnings:', result.warnings);
      }
      console.log('Headings found:', result.headings);
      console.groupEnd();
    }
  }, [enabled, h1Text]);

  return null; // This component doesn't render anything
}
