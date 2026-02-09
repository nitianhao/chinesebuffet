import SiteShell from '@/components/layout/SiteShell';

export default function NeighborhoodLoading() {
  return (
    <SiteShell>
      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)] animate-pulse">
        <div className="h-6 w-32 rounded bg-[var(--surface2)]" />
        <div className="mt-4 h-8 w-3/4 rounded bg-[var(--surface2)]" />
        <div className="mt-3 h-4 w-1/2 rounded bg-[var(--surface2)]" />
      </section>
      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)] animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 rounded-lg bg-[var(--surface2)]" />
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
