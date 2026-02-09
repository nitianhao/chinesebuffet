'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { TOCSectionClient } from '@/lib/tocConfig';

interface TableOfContentsProps {
  sections: TOCSectionClient[];
  headerOffset?: number; // Offset for sticky header (in pixels)
}

export default function TableOfContents({ sections, headerOffset = 80 }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Handle smooth scroll to section
  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      // Get the element's position relative to the document
      const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
      
      // Account for header offset and scroll margin (scroll-mt-24 = 6rem = 96px)
      // We use a slightly larger offset to ensure proper spacing
      const scrollOffset = headerOffset + 16; // 80 + 16 = 96px to match scroll-mt-24
      const targetPosition = elementTop - scrollOffset;

      // Scroll to the calculated position
      window.scrollTo({
        top: Math.max(0, targetPosition),
        behavior: 'smooth',
      });

      // Update URL hash without triggering scroll
      if (window.history.pushState) {
        window.history.pushState(null, '', `#${id}`);
      }

      // Manually set active ID immediately for better UX
      setActiveId(id);

      // Close mobile menu if open
      setIsMobileMenuOpen(false);
    }
  }, [headerOffset]);

  // Set up IntersectionObserver to track active section
  useEffect(() => {
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create new observer with improved logic
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find all intersecting entries
        const intersectingEntries = entries.filter((entry) => entry.isIntersecting);
        
        if (intersectingEntries.length === 0) {
          // If nothing is intersecting, use scroll position to determine active section
          const scrollPos = window.scrollY + headerOffset + 20;
          let activeSectionId = '';
          
          // Find the section that's currently at the top
          for (let i = sections.length - 1; i >= 0; i--) {
            const element = document.getElementById(sections[i].id);
            if (element && element.offsetTop <= scrollPos) {
              activeSectionId = sections[i].id;
              break;
            }
          }
          
          if (activeSectionId && activeSectionId !== activeId) {
            setActiveId(activeSectionId);
          }
          return;
        }

        // Among intersecting entries, find the one closest to the top of viewport
        intersectingEntries.sort((a, b) => {
          const aTop = a.boundingClientRect.top;
          const bTop = b.boundingClientRect.top;
          
          // Prefer sections that are at or above the header offset
          const aScore = aTop <= headerOffset ? aTop : aTop + 1000;
          const bScore = bTop <= headerOffset ? bTop : bTop + 1000;
          
          return aScore - bScore;
        });

        const topEntry = intersectingEntries[0];
        if (topEntry && topEntry.target.id && topEntry.target.id !== activeId) {
          setActiveId(topEntry.target.id);
        }
      },
      {
        rootMargin: `-${headerOffset}px 0px -60% 0px`, // Trigger when section is in top portion of viewport
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      }
    );

    // Observe all sections - use a small delay to ensure DOM is ready
    const observeSections = () => {
      sections.forEach((section) => {
        const element = document.getElementById(section.id);
        if (element) {
          sectionRefs.current.set(section.id, element);
          observerRef.current?.observe(element);
        } else {
          // Log missing sections for debugging
          console.warn(`TOC: Section with id "${section.id}" not found in DOM`);
        }
      });
    };

    // Try immediately, then retry after a short delay to catch dynamically rendered sections
    observeSections();
    const timeoutId = setTimeout(observeSections, 500);
    const timeoutId2 = setTimeout(observeSections, 1500); // Second retry for slow-loading content

    // Check initial hash on mount
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.slice(1);
      if (hash && sections.some((s) => s.id === hash)) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          scrollToSection(hash);
        }, 100);
      }
    }

    // Add scroll listener as fallback to ensure we track all sections
    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const scrollPos = window.scrollY + headerOffset + 20;
        let newActiveId = '';
        
        // Find the section that's currently at the top
        for (let i = sections.length - 1; i >= 0; i--) {
          const element = document.getElementById(sections[i].id);
          if (element) {
            const elementTop = element.offsetTop;
            if (scrollPos >= elementTop) {
              newActiveId = sections[i].id;
              break;
            }
          }
        }
        
        if (newActiveId && newActiveId !== activeId) {
          setActiveId(newActiveId);
        }
      }, 50);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
      clearTimeout(scrollTimeout);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, [sections, headerOffset, activeId, scrollToSection]);

  // Handle hash changes from browser navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && sections.some((s) => s.id === hash)) {
        scrollToSection(hash);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [sections, scrollToSection]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Handle ESC key to close mobile menu
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isMobileMenuOpen]);

  // Handle click outside mobile menu
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setIsMobileMenuOpen(false);
    }
  };

  if (sections.length === 0) {
    return null;
  }

  return (
    <>
      {/* Mobile: Sticky trigger button */}
      <div className="lg:hidden fixed right-4 z-[10000] bottom-[calc(var(--bottom-nav-height)+1rem)]">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="bg-[var(--accent1)] text-white px-4 py-3 rounded-full shadow-lg hover:bg-[var(--accent2)] transition-colors flex items-center gap-2 min-h-[48px] min-w-[48px]"
          aria-label="Open table of contents"
          aria-expanded={isMobileMenuOpen}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
          <span className="font-medium">On this page</span>
        </button>
      </div>

      {/* Mobile: Bottom sheet overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[10002]"
          onClick={handleBackdropClick}
          aria-modal="true"
          role="dialog"
          aria-label="Table of contents"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
          
          {/* Bottom sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col animate-slide-up">
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">On this page</h2>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 -mr-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close menu"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Menu items */}
            <nav className="flex-1 overflow-y-auto px-6 py-4" aria-label="Table of contents">
              <ul className="space-y-1">
                {sections.map((section) => {
                  const isActive = activeId === section.id;
                  return (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          scrollToSection(section.id);
                        }}
                        className={`
                          block px-4 py-3 rounded-lg text-base transition-colors
                          ${isActive
                            ? 'bg-[var(--surface2)] text-[var(--accent1)] font-medium'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                          }
                        `}
                        aria-current={isActive ? 'location' : undefined}
                      >
                        {section.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </div>
      )}

      {/* Desktop: Sticky sidebar */}
      <aside
        className="hidden lg:block fixed top-24 right-4 xl:right-8 w-56 xl:w-64 z-30 max-h-[calc(100vh-8rem)] overflow-y-auto"
        aria-label="Table of contents"
      >
        <nav className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 px-2">On this page</h2>
          <ul className="space-y-1">
            {sections.map((section) => {
              const isActive = activeId === section.id;
              return (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToSection(section.id);
                    }}
                    className={`
                      block px-3 py-2 rounded-md text-sm transition-colors
                      ${isActive
                        ? 'bg-[var(--surface2)] text-[var(--accent1)] font-medium border-l-2 border-[var(--accent1)]'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }
                    `}
                    aria-current={isActive ? 'location' : undefined}
                  >
                    {section.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Add CSS for slide-up animation */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
}
