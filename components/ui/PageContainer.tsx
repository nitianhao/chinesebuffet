import React from 'react';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * PageContainer - Main wrapper for page content
 * Provides consistent max-width, padding, and centering
 */
export default function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className={`container mx-auto px-4 py-4 md:py-6 ${className}`}>
      {children}
    </div>
  );
}
