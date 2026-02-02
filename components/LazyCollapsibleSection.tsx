'use client';

import { useState, useEffect, useRef, useId, ReactNode } from 'react';

interface LazyCollapsibleSectionProps {
  id: string;
  title: string;
  icon?: ReactNode;
  /** 
   * Content to render. Only rendered when section is activated (expanded or near viewport).
   * This ensures children are not mounted until needed.
   */
  children: ReactNode;
  defaultExpanded?: boolean;
  priority?: 'high' | 'medium' | 'low';
  className?: string;
  /**
   * Distance in pixels before viewport to activate (default: 1000px)
   */
  viewportThreshold?: number;
  /**
   * Minimum delay in ms before activation (ensures LCP completes)
   */
  minDelay?: number;
}

/**
 * LazyCollapsibleSection Component
 * 
 * Lazy-loads collapsible sections with true DOM node deferral:
 * - Children are NOT rendered in DOM until activated
 * - Uses IntersectionObserver to detect when near viewport
 * - Uses lazy hydration (client-side only)
 * - Only creates DOM nodes when expanded or within viewport threshold
 * 
 * Activation triggers:
 * 1. User clicks expand button (mobile, low priority)
 * 2. Section scrolls within viewportThreshold of viewport
 * 3. Priority is 'high' or defaultExpanded is true (immediate)
 * 
 * This ensures heavy content (FAQs, Related Links, etc.) doesn't
 * exist in the DOM until needed, reducing initial page weight.
 */
export default function LazyCollapsibleSection({
  id,
  title,
  icon,
  children,
  defaultExpanded = false,
  priority = 'medium',
  className = '',
  viewportThreshold = 1000,
  minDelay = 100,
}: LazyCollapsibleSectionProps) {
  const sectionId = useId();
  const contentId = `${sectionId}-content`;
  const buttonId = `${sectionId}-button`;
  const containerRef = useRef<HTMLElement>(null);
  
  // Track activation state (when children should be rendered)
  const [isActivated, setIsActivated] = useState(() => {
    // High priority or defaultExpanded: activate immediately
    if (priority === 'high' || defaultExpanded) return true;
    return false;
  });
  
  // Track expanded state (for mobile collapsible behavior)
  const [isExpanded, setIsExpanded] = useState(() => {
    if (priority === 'high' || defaultExpanded) return true;
    if (priority === 'low') return false;
    return defaultExpanded;
  });

  const isAlwaysExpanded = priority === 'high' || defaultExpanded;
  const shouldStartCollapsed = priority === 'low' && !isAlwaysExpanded;

  useEffect(() => {
    // If already activated, don't set up observer
    if (isActivated) return;

    // High priority sections activate immediately
    if (priority === 'high' || defaultExpanded) {
      setIsActivated(true);
      return;
    }

    const element = containerRef.current;
    if (!element) return;

    // Use IntersectionObserver to detect when section is near viewport
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // Delay activation slightly to ensure LCP completes
          setTimeout(() => {
            setIsActivated(true);
          }, minDelay);
          observer.disconnect();
        }
      },
      {
        rootMargin: `${viewportThreshold}px`,
        threshold: 0,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [isActivated, priority, defaultExpanded, viewportThreshold, minDelay]);

  // Activate when user expands on mobile
  const handleExpand = () => {
    setIsExpanded(!isExpanded);
    if (!isActivated) {
      setIsActivated(true);
    }
  };

  return (
    <section
      id={id}
      ref={containerRef}
      className={`scroll-mt-24 ${className}`}
      data-lazy-section={!isActivated}
    >
      {/* Section Divider with Icon and Title - Always rendered */}
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
            onClick={handleExpand}
            aria-expanded={isExpanded}
            aria-controls={contentId}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
          >
            <span className="text-sm font-medium text-gray-700">
              {isExpanded ? 'Hide' : 'Show'} {title}
            </span>
            <svg
              className={`w-5 h-5 text-gray-600 transition-transform duration-200 ${
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
        </div>
      )}

      {/* Content Container - Only renders children when activated */}
      {/* DOM nodes do NOT exist until isActivated is true */}
      {isActivated && (
        <div
          id={contentId}
          className={
            isAlwaysExpanded
              ? 'block'
              : shouldStartCollapsed
              ? `md:block ${
                  isExpanded
                    ? 'block max-h-none opacity-100'
                    : 'hidden max-h-0 opacity-0'
                } transition-all duration-300 ease-in-out`
              : 'block'
          }
        >
          {/* Lazy hydration: children are only rendered when activated */}
          {/* This ensures DOM nodes are not mounted until needed */}
          {children}
        </div>
      )}
      
      {/* Placeholder when not activated - minimal DOM footprint */}
      {!isActivated && (
        <div
          id={contentId}
          className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm"
          aria-hidden="true"
        >
          <p className="text-sm text-gray-500 italic">
            {title} content will load when you scroll near this section.
          </p>
        </div>
      )}
    </section>
  );
}
