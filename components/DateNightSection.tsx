import DisclosureCard from '@/components/ui/DisclosureCard';
import { computeDateNightScore } from '@/lib/dateNightScore';

interface DateNightSectionProps {
  buffet: any;
}

export default function DateNightSection({ buffet }: DateNightSectionProps) {
  const result = computeDateNightScore(buffet);

  if (result.dateNightScore < 25) return null;

  const { dateNightScore, dateNightTier, dateNightTierEmoji, subScores, positiveSignals, negativeSignals } = result;

  const summary = `Score ${dateNightScore}/100 · ${positiveSignals.length} positive signal${positiveSignals.length !== 1 ? 's' : ''}`;

  const SUB_SCORE_LABELS: Record<keyof typeof subScores, { label: string; max: number }> = {
    ambiance:            { label: 'Ambiance',            max: 30 },
    drinks:              { label: 'Drinks',              max: 25 },
    eveningViability:    { label: 'Evening hours',       max: 20 },
    serviceAndExperience:{ label: 'Service & experience',max: 15 },
    surroundings:        { label: 'Surroundings',        max: 10 },
  };

  return (
    <DisclosureCard
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden>{dateNightTierEmoji}</span>
          <span>{dateNightTier}</span>
        </span>
      }
      summary={summary}
      defaultOpen
      titleAs="h2"
      className="page-block-gap"
      icon={null}
    >
      <div className="space-y-5">
        {/* Overall score bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-[var(--muted)]">Date night score</span>
            <span className="text-xs font-semibold tabular-nums text-[var(--text)]">
              {dateNightScore}/100
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
            <div
              className="h-2 rounded-full bg-[var(--accent1)] transition-all"
              style={{ width: `${dateNightScore}%` }}
            />
          </div>
        </div>

        {/* Sub-score breakdown */}
        <div className="space-y-2">
          {(Object.entries(SUB_SCORE_LABELS) as [keyof typeof subScores, { label: string; max: number }][]).map(
            ([key, { label, max }]) => {
              const val = subScores[key];
              const pct = Math.round((val / max) * 100);
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--muted)] w-36 shrink-0 truncate" title={label}>
                    {label}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--border)]">
                    <div
                      className="h-1.5 rounded-full bg-[var(--accent1)] opacity-70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-[var(--muted)] w-8 text-right shrink-0">
                    {val}/{max}
                  </span>
                </div>
              );
            }
          )}
        </div>

        {/* Signals */}
        {(positiveSignals.length > 0 || negativeSignals.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {positiveSignals.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-2">
                  What works
                </p>
                <ul className="space-y-1">
                  {positiveSignals.map((s) => (
                    <li key={s} className="flex items-start gap-1.5 text-xs text-[var(--text)]">
                      <span className="mt-px text-[var(--accent1)]" aria-hidden>✓</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {negativeSignals.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-2">
                  Keep in mind
                </p>
                <ul className="space-y-1">
                  {negativeSignals.map((s) => (
                    <li key={s} className="flex items-start gap-1.5 text-xs text-[var(--muted)]">
                      <span className="mt-px" aria-hidden>–</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-[var(--muted)]">
          Scored from ambiance, drinks, hours, service, and nearby nightlife.
        </p>
      </div>
    </DisclosureCard>
  );
}
