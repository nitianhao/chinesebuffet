'use client';

export default function StatesHubError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[var(--page-max-w)] px-[var(--page-x)] py-[var(--page-y)]">
      <div className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <h2 className="text-lg font-semibold text-[var(--text)]">Something went wrong</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          We could not load the states list right now. Please try again.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--accent1)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
