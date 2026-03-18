import DisclosureCard from '@/components/ui/DisclosureCard';
import { detectAuthenticitySignals } from '@/lib/authenticitySignals';
import type { AuthenticitySignal } from '@/lib/authenticitySignals';

interface AuthenticitySectionProps {
  buffet: any;
}

export default function AuthenticitySection({ buffet }: AuthenticitySectionProps) {
  const result = detectAuthenticitySignals({
    name: buffet.name,
    description: buffet.description2 || buffet.description,
    questionsAndAnswers: buffet.questionsAndAnswers,
    menuItems: buffet.menuItems,
    reviewsTags: buffet.reviewsTags,
  });

  if (result.authenticityScore < 25) return null;

  const { authenticityTier, authenticityScore, cuisineOrigins, primaryCuisine, signals } = result;

  // Derive a concise summary line
  const summary = primaryCuisine
    ? `${primaryCuisine} regional cuisine · score ${authenticityScore}/100`
    : `Authenticity score ${authenticityScore}/100`;

  // Group signals by type for display
  const dishSignals = signals.filter((s) => s.signalType === 'regional_dishes');
  const cuisineSignals = signals.filter((s) => s.signalType === 'regional_cuisine');
  const prepSignals = signals.filter((s) => s.signalType === 'traditional_prep');
  const hasChineseChars = signals.some((s) => s.signalType === 'chinese_characters');
  const hasExplicitAuthentic = signals.some((s) => s.signalType === 'explicit_authentic');

  // Unique dish names for display
  const dishes = Array.from(new Set(dishSignals.map((s) => titleCase(s.evidence))));

  // Unique cuisine names for display
  const uniqueCuisines = Array.from(
    new Set(cuisineSignals.map((s) => s.impliedCuisine).filter(Boolean) as string[]),
  );

  // Unique prep methods
  const prepMethods = Array.from(new Set(prepSignals.map((s) => s.evidence)));

  return (
    <DisclosureCard
      title={
        <span className="flex items-center gap-2">
          <span>{authenticityTier}</span>
        </span>
      }
      summary={summary}
      defaultOpen
      titleAs="h2"
      className="page-block-gap"
      icon={null}
    >
      <div className="space-y-4">
        {/* Score bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-[var(--muted)]">Authenticity score</span>
            <span className="text-xs font-semibold tabular-nums text-[var(--text)]">
              {authenticityScore}/100
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden">
            <div
              className="h-2 rounded-full bg-[var(--accent1)] transition-all"
              style={{ width: `${authenticityScore}%` }}
            />
          </div>
        </div>

        {/* Signal chips */}
        <div className="flex flex-wrap gap-2">
          {hasExplicitAuthentic && (
            <SignalChip label="Authentic" icon="✓" highlight />
          )}
          {hasChineseChars && (
            <SignalChip label="Chinese name" icon="字" />
          )}
          {uniqueCuisines.map((c) => (
            <SignalChip key={c} label={c} icon="🏷" />
          ))}
          {prepMethods.map((m) => (
            <SignalChip key={m} label={titleCase(m)} icon="👨‍🍳" />
          ))}
        </div>

        {/* Regional dishes */}
        {dishes.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-2">
              Regional dishes detected
            </p>
            <div className="flex flex-wrap gap-1.5">
              {dishes.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center rounded-full bg-[var(--surface2)] ring-1 ring-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text)]"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-[var(--muted)]">
          Detected from menu, FAQ answers, and restaurant name.
        </p>
      </div>
    </DisclosureCard>
  );
}

function SignalChip({ label, icon, highlight = false }: { label: string; icon: string; highlight?: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1',
        highlight
          ? 'bg-[var(--accent1)] text-white ring-transparent'
          : 'bg-[var(--surface2)] text-[var(--text)] ring-[var(--border)]',
      ].join(' ')}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
