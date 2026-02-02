'use client';

import React from 'react';

interface JumpToSection {
  id: string;
  label: string;
}

interface JumpToNavProps {
  sections: JumpToSection[];
  variant?: 'dropdown' | 'chips';
  className?: string;
}

/**
 * JumpToNav - Quick navigation to page sections
 * Features: dropdown on mobile, chips on desktop, smooth scroll
 */
export default function JumpToNav({
  sections,
  variant = 'dropdown',
  className = '',
}: JumpToNavProps) {
  const handleJumpTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80; // Header height
      const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  if (variant === 'dropdown') {
    return (
      <div className={`bg-[var(--surface)] rounded-2xl ring-1 ring-[var(--border)] shadow-sm p-4 ${className}`}>
        <label htmlFor="jump-to" className="block text-xs font-medium uppercase tracking-wide text-[var(--muted)] mb-2">
          Jump to section
        </label>
        <select
          id="jump-to"
          onChange={(e) => handleJumpTo(e.target.value)}
          className="w-full px-3 py-2 rounded-xl ring-1 ring-[var(--border)] text-sm focus:outline-none focus:ring-2 focus:ring-[#C1121F]/40 bg-[var(--surface)]"
          defaultValue=""
        >
          <option value="" disabled>
            Select a section...
          </option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Chips variant
  return (
    <div className={`bg-[var(--surface)] rounded-2xl ring-1 ring-[var(--border)] shadow-sm p-4 ${className}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)] mb-3">Jump to</div>
      <div className="flex flex-wrap gap-2">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => handleJumpTo(section.id)}
            className="px-2.5 py-1 text-xs font-medium text-[var(--muted)] bg-[var(--surface2)] ring-1 ring-[var(--border)] rounded-full hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors focus:outline-none focus:ring-2 focus:ring-[#C1121F]/40"
          >
            {section.label}
          </button>
        ))}
      </div>
    </div>
  );
}
