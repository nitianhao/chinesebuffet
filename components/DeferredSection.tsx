'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';

interface DeferredSectionProps {
  id: string;
  title?: string;
  summary?: ReactNode; // SSR-safe summary content (computed on server)
  children: ReactNode; // Heavy content to defer
  threshold?: number; // Distance in pixels before activation (default: 800px)
  className?: string;
}

/**
 * DeferredSection Component
 * 
 * SEO-safe lazy-loading for heavy sections:
 * - Always renders summary (SSR-safe) for crawlers
 * - Uses IntersectionObserver to activate when within threshold
 * - Disconnects observer after activation for performance
 * - Section wrapper and anchor id always exist for TOC navigation
 */
export default function DeferredSection({
  id,
  title,
  summary,
  children,
  threshold = 800,
  className = '',
}: DeferredSectionProps) {
  const [isActive, setIsActive] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // If already active, don't set up observer
    if (isActive) return;

    // Check if IntersectionObserver is available (browser only)
    if (typeof window === 'undefined' || !window.IntersectionObserver) {
      // Fallback: activate immediately on server or if observer not available
      setIsActive(true);
      return;
    }

    const element = sectionRef.current;
    if (!element) return;

    // Create observer with rootMargin to trigger before section enters viewport
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsActive(true);
            // Disconnect observer after activation to save resources
            if (observerRef.current) {
              observerRef.current.disconnect();
              observerRef.current = null;
            }
          }
        });
      },
      {
        rootMargin: `${threshold}px`, // Trigger when within threshold pixels of viewport
        threshold: 0, // Trigger as soon as any part enters the margin area
      }
    );

    observerRef.current.observe(element);

    // Cleanup on unmount
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [isActive, threshold]);

  return (
    <section
      id={id}
      ref={sectionRef}
      className={`scroll-mt-24 ${className}`}
    >
      {title && (
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
      )}
      
      {/* Always render summary for SEO - visible when inactive */}
      {!isActive && summary && (
        <div className="text-gray-700">
          {summary}
        </div>
      )}
      
      {/* Render full content when active */}
      {isActive && (
        <div>
          {children}
        </div>
      )}
    </section>
  );
}
