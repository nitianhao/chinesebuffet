interface BestTimeToVisitProps {
  popularTimesHistogram?: any;
  hours?: any;
  reviews?: Array<{
    text?: string;
    textTranslated?: string;
    visitedIn?: string;
    publishAt?: string;
  }>;
}

interface TimeSlot {
  hour: number;
  occupancyPercent: number;
}

interface DayData {
  day: string;
  entries: TimeSlot[];
}

/**
 * Normalize popular times histogram data
 */
function normalizePopularTimes(raw: any): DayData[] {
  if (!raw || typeof raw !== 'object') return [];

  const dayOrder = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const dayLabels: Record<string, string> = {
    Su: 'Sunday',
    Mo: 'Monday',
    Tu: 'Tuesday',
    We: 'Wednesday',
    Th: 'Thursday',
    Fr: 'Friday',
    Sa: 'Saturday',
  };

  return dayOrder
    .map((day) => ({
      day: dayLabels[day] || day,
      entries: Array.isArray(raw[day])
        ? raw[day].filter((e: any) => e && typeof e.hour === 'number' && typeof e.occupancyPercent === 'number')
        : [],
    }))
    .filter((item) => item.entries.length > 0);
}

/**
 * Find busiest hours across all days
 */
function findBusiestHours(daysData: DayData[]): { hour: number; avgOccupancy: number }[] {
  const hourMap = new Map<number, number[]>();

  // Collect occupancy percentages for each hour across all days
  daysData.forEach((day) => {
    day.entries.forEach((entry) => {
      if (!hourMap.has(entry.hour)) {
        hourMap.set(entry.hour, []);
      }
      hourMap.get(entry.hour)!.push(entry.occupancyPercent);
    });
  });

  // Calculate average occupancy for each hour
  const hourAverages = Array.from(hourMap.entries())
    .map(([hour, occupancies]) => ({
      hour,
      avgOccupancy: occupancies.reduce((a, b) => a + b, 0) / occupancies.length,
    }))
    .sort((a, b) => b.avgOccupancy - a.avgOccupancy);

  return hourAverages;
}

/**
 * Find quiet windows (hours with low occupancy)
 */
function findQuietWindows(daysData: DayData[]): { hour: number; avgOccupancy: number }[] {
  const hourAverages = findBusiestHours(daysData);
  return hourAverages
    .filter((h) => h.avgOccupancy < 40)
    .sort((a, b) => a.hour - b.hour);
}

/**
 * Format hour for display
 */
function formatHour(hour: number): string {
  const period = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}${period}`;
}

/**
 * Format time range
 */
function formatTimeRange(startHour: number, endHour: number): string {
  return `${formatHour(startHour)}–${formatHour(endHour)}`;
}

/**
 * Infer busy times from reviews
 */
function inferFromReviews(reviews: BestTimeToVisitProps['reviews'] = []): {
  busyTimes: string[];
  quietTimes: string[];
  isInferred: boolean;
} {
  const allText = reviews
    .map((r) => (r.textTranslated || r.text || '').toLowerCase())
    .join(' ');

  const busyKeywords = ['busy', 'crowded', 'packed', 'rush', 'peak', 'lunch rush', 'dinner rush'];
  const quietKeywords = ['quiet', 'empty', 'slow', 'not busy', 'peaceful', 'calm'];
  const lunchKeywords = ['lunch', 'noon', 'midday', '12', '1pm', '2pm'];
  const dinnerKeywords = ['dinner', 'evening', 'night', '6pm', '7pm', '8pm'];
  const morningKeywords = ['morning', 'breakfast', 'early', '9am', '10am', '11am'];

  const hasBusyMentions = busyKeywords.some((k) => allText.includes(k));
  const hasQuietMentions = quietKeywords.some((k) => allText.includes(k));
  const hasLunchMentions = lunchKeywords.some((k) => allText.includes(k));
  const hasDinnerMentions = dinnerKeywords.some((k) => allText.includes(k));
  const hasMorningMentions = morningKeywords.some((k) => allText.includes(k));

  const busyTimes: string[] = [];
  const quietTimes: string[] = [];

  if (hasBusyMentions) {
    if (hasLunchMentions) {
      busyTimes.push('Lunch (12–2pm)');
    }
    if (hasDinnerMentions) {
      busyTimes.push('Dinner (6–8pm)');
    }
    if (!hasLunchMentions && !hasDinnerMentions) {
      busyTimes.push('Peak meal times');
    }
  }

  if (hasQuietMentions) {
    if (hasMorningMentions) {
      quietTimes.push('Early morning (9–11am)');
    } else {
      quietTimes.push('Off-peak hours');
    }
  }

  return {
    busyTimes: busyTimes.length > 0 ? busyTimes : [],
    quietTimes: quietTimes.length > 0 ? quietTimes : [],
    isInferred: true,
  };
}

/**
 * Generate text guidance from data
 */
function generateGuidance(
  daysData: DayData[],
  isInferred: boolean
): { busyText: string | null; quietText: string | null } {
  if (daysData.length === 0) {
    return { busyText: null, quietText: null };
  }

  const busiestHours = findBusiestHours(daysData);
  const quietWindows = findQuietWindows(daysData);

  // Find lunch peak (11am-2pm)
  const lunchHours = busiestHours.filter((h) => h.hour >= 11 && h.hour <= 14);
  const lunchPeak = lunchHours.length > 0 ? lunchHours[0] : null;

  // Find dinner peak (5pm-9pm)
  const dinnerHours = busiestHours.filter((h) => h.hour >= 17 && h.hour <= 21);
  const dinnerPeak = dinnerHours.length > 0 ? dinnerHours[0] : null;

  let busyText: string | null = null;
  if (lunchPeak && lunchPeak.avgOccupancy >= 60) {
    const startHour = Math.max(11, lunchPeak.hour - 1);
    const endHour = Math.min(14, lunchPeak.hour + 2);
    busyText = `Lunch is busiest ${formatTimeRange(startHour, endHour)}`;
  } else if (dinnerPeak && dinnerPeak.avgOccupancy >= 60) {
    const startHour = Math.max(17, dinnerPeak.hour - 1);
    const endHour = Math.min(21, dinnerPeak.hour + 2);
    busyText = `Dinner is busiest ${formatTimeRange(startHour, endHour)}`;
  } else if (busiestHours.length > 0 && busiestHours[0].avgOccupancy >= 50) {
    const peak = busiestHours[0];
    const startHour = Math.max(0, peak.hour - 1);
    const endHour = Math.min(23, peak.hour + 2);
    busyText = `Peak hours are ${formatTimeRange(startHour, endHour)}`;
  }

  let quietText: string | null = null;
  if (quietWindows.length > 0) {
    const quietHour = quietWindows[0];
    if (quietHour.avgOccupancy < 30) {
      const startHour = Math.max(0, quietHour.hour - 1);
      const endHour = Math.min(23, quietHour.hour + 2);
      quietText = `Quietest window: ${formatTimeRange(startHour, endHour)}`;
    }
  }

  return { busyText, quietText };
}

export default function BestTimeToVisit({
  popularTimesHistogram,
  hours,
  reviews,
}: BestTimeToVisitProps) {
  // Compute on the server — no useMemo needed (no re-renders).
  const normalized = normalizePopularTimes(popularTimesHistogram);
  const { daysData, isInferred, busyTimes, quietTimes, guidance } = normalized.length > 0
    ? {
        daysData: normalized,
        isInferred: false,
        busyTimes: [] as string[],
        quietTimes: [] as string[],
        guidance: generateGuidance(normalized, false),
      }
    : (() => {
        const inferred = inferFromReviews(reviews);
        return {
          daysData: [] as DayData[],
          isInferred: true,
          busyTimes: inferred.busyTimes,
          quietTimes: inferred.quietTimes,
          guidance: { busyText: null as string | null, quietText: null as string | null },
        };
      })();

  // Don't render if we have no data at all
  if (daysData.length === 0 && busyTimes.length === 0 && quietTimes.length === 0 && !guidance.busyText && !guidance.quietText) {
    return null;
  }

  // Get max occupancy for visualization
  const maxOccupancy = daysData.length > 0
    ? Math.max(...daysData.flatMap((d) => d.entries.map((e) => e.occupancyPercent)))
    : 0;

  return (
    <section className="mb-6">
      <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-bold text-gray-900">Best time to visit</h3>
          {isInferred && (
            <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full font-medium">
              Inferred
            </span>
          )}
        </div>

        {/* Busy Hours Visualization */}
        {daysData.length > 0 && (
          <div className="mb-4 pb-4 border-b border-gray-200">
            <div className="text-sm font-medium text-gray-700 mb-3">Busy hours by day</div>
            <div className="space-y-3">
              {daysData.map((day) => (
                <div key={day.day}>
                  <div className="text-xs font-medium text-gray-600 mb-1">{day.day}</div>
                  <div className="flex items-end gap-1 h-12">
                    {day.entries.map((entry, idx) => {
                      const height = maxOccupancy > 0 ? (entry.occupancyPercent / maxOccupancy) * 100 : 0;
                      const isBusy = entry.occupancyPercent >= 60;
                      const isModerate = entry.occupancyPercent >= 40 && entry.occupancyPercent < 60;
                      
                      return (
                        <div
                          key={idx}
                          className="flex-1 flex flex-col items-center group relative"
                          title={`${formatHour(entry.hour)} - ${entry.occupancyPercent}% busy`}
                        >
                          <div className="w-full flex flex-col items-center justify-end h-12">
                            <div
                              className={`w-full rounded-t transition-all hover:opacity-80 ${
                                isBusy
                                  ? 'bg-red-500'
                                  : isModerate
                                  ? 'bg-orange-400'
                                  : 'bg-green-400'
                              }`}
                              style={{ height: `${Math.max(height, 5)}%` }}
                            />
                          </div>
                          {idx % 4 === 0 && (
                            <span className="text-xs text-gray-500 mt-1">{formatHour(entry.hour)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Text Guidance */}
        <div className="space-y-2.5">
          {(guidance.busyText || busyTimes.length > 0) && (
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-gray-700">
                <span className="font-medium">Busy:</span>{' '}
                {guidance.busyText || busyTimes.join(', ')}
              </div>
            </div>
          )}

          {(guidance.quietText || quietTimes.length > 0) && (
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-gray-700">
                <span className="font-medium">Quiet:</span>{' '}
                {guidance.quietText || quietTimes.join(', ')}
              </div>
            </div>
          )}

          {!guidance.busyText && !guidance.quietText && busyTimes.length === 0 && quietTimes.length === 0 && daysData.length > 0 && (
            <div className="text-sm text-gray-600 italic">
              Off-peak hours tend to be quieter.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
