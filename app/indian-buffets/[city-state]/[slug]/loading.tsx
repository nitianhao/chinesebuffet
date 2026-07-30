import SiteShell from '@/components/layout/SiteShell';

export default function BuffetDetailLoading() {
  return (
    <SiteShell>
      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)] animate-pulse">
        <div className="h-6 w-40 rounded bg-[var(--surface2)]" />
        <div className="mt-4 h-8 w-3/4 rounded bg-[var(--surface2)]" />
        <div className="mt-3 h-4 w-1/2 rounded bg-[var(--surface2)]" />
      </section>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)] animate-pulse">
        <div className="h-5 w-28 rounded bg-[var(--surface2)]" />
        <div className="mt-4 h-48 w-full rounded-[var(--radius-lg)] bg-[var(--surface2)]" />
        <div className="mt-4 flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 w-28 rounded-[var(--radius-md)] bg-[var(--surface2)]" />
          ))}
        </div>
      </section>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)] animate-pulse">
        <div className="h-5 w-32 rounded bg-[var(--surface2)]" />
        <div className="mt-3 h-4 w-2/3 rounded bg-[var(--surface2)]" />
        <div className="mt-2 h-4 w-1/2 rounded bg-[var(--surface2)]" />
      </section>
    </SiteShell>
  );
}
