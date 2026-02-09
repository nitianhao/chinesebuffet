interface PopularTimesProps {
  histogram?: {
    [key: string]: Array<{
      hour: number;
      occupancyPercent: number;
    }>;
  } | null;
  liveText?: string | null;
  livePercent?: number | null;
}

export default function PopularTimes({ histogram, liveText, livePercent }: PopularTimesProps) {
  // Check if histogram is an object and has data
  if (!histogram || typeof histogram !== 'object' || Object.keys(histogram).length === 0) {
    return null;
  }

  const dayOrder = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayAbbr = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  // Get current day
  const today = new Date().getDay();
  const currentDayIndex = today === 0 ? 6 : today - 1; // Convert Sunday (0) to index 6
  const currentDayKey = dayOrder[currentDayIndex];

  const getBusyLevel = (popularity: number) => {
    if (popularity >= 80) return { label: 'Very busy', color: 'bg-red-500' };
    if (popularity >= 60) return { label: 'Busy', color: 'bg-orange-500' };
    if (popularity >= 40) return { label: 'Moderately busy', color: 'bg-yellow-500' };
    if (popularity >= 20) return { label: 'Usually not busy', color: 'bg-green-500' };
    return { label: 'Not busy', color: 'bg-gray-300' };
  };

  return (
    <div className="space-y-4">
      {/* Current Status */}
      {(liveText || livePercent !== null) && (
        <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-[var(--surface)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--accent1)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--text)] mb-1">Live Status</div>
              {liveText && (
                <div className="text-lg font-semibold text-[var(--accent1)]">{liveText}</div>
              )}
              {livePercent !== null && livePercent !== undefined && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-[var(--accent-light)] rounded-full h-2">
                      <div
                        className="bg-[var(--accent1)] h-2 rounded-full transition-all"
                        style={{ width: `${livePercent}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-[var(--accent1)]">{livePercent}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Weekly Chart */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900">Popular Times</h3>
        <div className="space-y-4">
          {dayOrder.map((dayKey, dayIndex) => {
            const dayData = histogram[dayKey];
            if (!dayData || !Array.isArray(dayData) || dayData.length === 0) {
              return null;
            }
            
            const isToday = dayKey === currentDayKey;
            const maxPopularity = Math.max(...dayData.map(h => h.occupancyPercent), 1);
            
            return (
              <div key={dayKey} className={`${isToday ? 'bg-[var(--surface2)] border border-[var(--border)]' : ''} rounded-lg p-3`}>
                <div className="flex items-center gap-4">
                  <div className="w-12 text-sm font-medium text-gray-700">
                    {dayAbbr[dayIndex]}
                    {isToday && <span className="block text-xs text-[var(--accent1)] font-semibold">Today</span>}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      {dayData.map((hour, hourIndex) => {
                        const busyLevel = getBusyLevel(hour.occupancyPercent);
                        const height = maxPopularity > 0 ? (hour.occupancyPercent / maxPopularity) * 100 : 0;
                        
                        return (
                          <div
                            key={hourIndex}
                            className="flex-1 flex flex-col items-center group relative"
                            title={`${hour.hour}:00 - ${busyLevel.label} (${hour.occupancyPercent}%)`}
                          >
                            <div className="w-full flex flex-col items-center justify-end h-16">
                              <div
                                className={`w-full ${busyLevel.color} rounded-t transition-all hover:opacity-80`}
                                style={{ height: `${Math.max(height, 5)}%` }}
                              />
                            </div>
                            {hourIndex % 4 === 0 && (
                              <span className="text-xs text-gray-500 mt-1">{hour.hour}</span>
                            )}
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                              {hour.hour}:00 - {busyLevel.label} ({hour.occupancyPercent}%)
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-gray-600 pt-2 border-t">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-300 rounded"></div>
            <span>Not busy</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span>Usually not busy</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-500 rounded"></div>
            <span>Moderately busy</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-orange-500 rounded"></div>
            <span>Busy</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span>Very busy</span>
          </div>
        </div>
      </div>
    </div>
  );
}
