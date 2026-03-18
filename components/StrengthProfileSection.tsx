import DisclosureCard from '@/components/ui/DisclosureCard';
import { computeStrengthProfile } from '@/lib/strengthProfile';
import type { StrengthProfileAxes } from '@/lib/strengthProfile';

interface StrengthProfileSectionProps {
  buffet: any;
}

const AXIS_CONFIG: Array<{ key: keyof StrengthProfileAxes; label: string }> = [
  { key: 'foodQuality', label: 'Food Quality' },
  { key: 'service',     label: 'Service' },
  { key: 'variety',     label: 'Variety' },
  { key: 'value',       label: 'Value' },
  { key: 'atmosphere',  label: 'Atmosphere' },
];

export default function StrengthProfileSection({ buffet }: StrengthProfileSectionProps) {
  const result = computeStrengthProfile(buffet);

  if (!result.profileTag) return null;

  const { axes, totalScore, profileTag, profileTagEmoji, dominantStrength, dominantStrengths } = result;

  const summary = `${totalScore}/100 total · strongest in ${dominantStrength}`;

  return (
    <DisclosureCard
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden>{profileTagEmoji}</span>
          <span>{profileTag}</span>
        </span>
      }
      summary={summary}
      defaultOpen
      titleAs="h2"
      className="page-block-gap"
      icon={null}
    >
      <div className="space-y-5">
        {/* Axis breakdown */}
        <div className="space-y-2">
          {AXIS_CONFIG.map(({ key, label }) => {
            const val = axes[key];
            const pct = Math.round((val / 20) * 100);
            const isStrong = val >= 12;
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs text-[var(--muted)] w-28 shrink-0 truncate" title={label}>
                  {label}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--border)]">
                  <div
                    className={`h-1.5 rounded-full transition-all ${isStrong ? 'bg-[var(--accent1)]' : 'bg-[var(--accent1)] opacity-50'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-[var(--muted)] w-8 text-right shrink-0">
                  {val}/20
                </span>
              </div>
            );
          })}
        </div>

        {/* Strong axes summary */}
        {dominantStrengths.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {dominantStrengths.map((label) => (
              <span
                key={label}
                className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent1)] bg-opacity-10 text-[var(--accent1)] font-medium"
              >
                {label}
              </span>
            ))}
          </div>
        )}

        <p className="text-xs text-[var(--muted)]">
          Scored from review highlights, FAQ answers, and listing attributes across five dimensions.
        </p>
      </div>
    </DisclosureCard>
  );
}
