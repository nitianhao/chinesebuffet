'use client';

import { useState, useEffect, useRef, ReactNode, Suspense } from 'react';

interface DeferredClientProps {
  children: ReactNode;
  /** 
   * Placeholder shown before content loads.
   * Can be a skeleton, summary, or null for invisible defer.
   */
  placeholder?: ReactNode;
  /**
   * Priority level affects when content renders:
   * - 'idle': Uses requestIdleCallback (lowest priority, never blocks LCP)
   * - 'interaction': Renders after first user interaction
   * - 'viewport': Renders when scrolling near viewport
   */
  priority?: 'idle' | 'interaction' | 'viewport';
  /**
   * For viewport priority: distance in pixels before element enters viewport
   */
  rootMargin?: number;
  /**
   * Minimum delay in ms before rendering (ensures LCP completes)
   */
  minDelay?: number;
  /**
   * ID for section anchoring (scrolling to this section)
   */
  id?: string;
  className?: string;
}

/**
 * DeferredClient Component
 * 
 * Client-side wrapper that defers rendering of heavy content to avoid blocking LCP.
 * Uses multiple strategies to ensure above-the-fold content renders first:
 * 
 * 1. idle: Uses requestIdleCallback to render during browser idle time
 * 2. interaction: Waits for user scroll/click/keypress before rendering
 * 3. viewport: Uses IntersectionObserver with generous rootMargin
 * 
 * SEO Note: Content is NOT rendered during SSR. For SEO-critical content,
 * use DeferredSection instead which renders a summary on the server.
 */
export default function DeferredClient({
  children,
  placeholder = null,
  priority = 'idle',
  rootMargin = 1000,
  minDelay = 100,
  id,
  className = '',
}: DeferredClientProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasRendered = useRef(false);

  useEffect(() => {
    // Prevent double-rendering
    if (hasRendered.current) return;

    const activate = () => {
      if (hasRendered.current) return;
      hasRendered.current = true;
      setShouldRender(true);
    };

    // Ensure minimum delay to let LCP complete
    const delayedActivate = () => {
      setTimeout(activate, minDelay);
    };

    if (priority === 'idle') {
      // Use requestIdleCallback if available, with timeout fallback
      if ('requestIdleCallback' in window) {
        const idleId = requestIdleCallback(delayedActivate, { timeout: 2000 });
        return () => cancelIdleCallback(idleId);
      } else {
        // Fallback: use setTimeout with longer delay
        const timeoutId = setTimeout(delayedActivate, 200);
        return () => clearTimeout(timeoutId);
      }
    }

    if (priority === 'interaction') {
      // Render on first user interaction
      const events = ['scroll', 'click', 'keydown', 'touchstart'];
      const handler = () => {
        events.forEach(e => window.removeEventListener(e, handler, { capture: true }));
        delayedActivate();
      };
      events.forEach(e => window.addEventListener(e, handler, { capture: true, passive: true }));
      
      // Fallback: render after 3 seconds even without interaction
      const fallbackTimeout = setTimeout(delayedActivate, 3000);
      
      return () => {
        events.forEach(e => window.removeEventListener(e, handler, { capture: true }));
        clearTimeout(fallbackTimeout);
      };
    }

    if (priority === 'viewport') {
      // Use IntersectionObserver to render when near viewport
      const element = containerRef.current;
      if (!element) {
        delayedActivate();
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            observer.disconnect();
            delayedActivate();
          }
        },
        { rootMargin: `${rootMargin}px` }
      );

      observer.observe(element);
      return () => observer.disconnect();
    }
  }, [priority, rootMargin, minDelay]);

  return (
    <div 
      ref={containerRef}
      id={id}
      className={`deferred-client ${className}`}
      data-deferred={!shouldRender}
    >
      {shouldRender ? (
        <Suspense fallback={placeholder}>
          {children}
        </Suspense>
      ) : (
        placeholder
      )}
    </div>
  );
}
