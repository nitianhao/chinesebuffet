'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Buffet page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-bold text-[var(--text)] mb-4">Error loading buffet</h1>
        <p className="text-[var(--muted)] mb-8">
          We encountered an error while loading this buffet page. Please try again.
        </p>
        {error.message && (
          <p className="text-sm text-[var(--muted)] mb-6 font-mono bg-[var(--surface2)] p-3 rounded break-words">
            {error.message}
          </p>
        )}
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="bg-gradient-to-r from-[var(--accent1)] to-[var(--accent2)] text-white px-6 py-3 rounded-lg hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <Link
            href="/"
            className="bg-[var(--surface2)] text-[var(--text)] px-6 py-3 rounded-lg hover:bg-[var(--surface)] transition-colors border border-[var(--border)]"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
