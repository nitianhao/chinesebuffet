import { Review } from '@/lib/data';

interface ReviewInsightsProps {
  reviews: Review[];
}

export default function ReviewInsights({ reviews }: ReviewInsightsProps) {
  if (!reviews || reviews.length === 0) {
    return null;
  }

  // Aggregate review context data
  const insights: Record<string, Record<string, number>> = {};

  reviews.forEach((review) => {
    if (review.reviewContext) {
      Object.entries(review.reviewContext).forEach(([key, value]) => {
        if (value && typeof value === 'string') {
          if (!insights[key]) {
            insights[key] = {};
          }
          insights[key][value] = (insights[key][value] || 0) + 1;
        }
      });
    }
  });

  // Filter to only show insights with meaningful data (at least 2 occurrences or >20% of reviews)
  const meaningfulInsights: Array<{ category: string; value: string; count: number; percentage: number }> = [];

  Object.entries(insights).forEach(([category, values]) => {
    Object.entries(values).forEach(([value, count]) => {
      const percentage = (count / reviews.length) * 100;
      if (count >= 2 || percentage > 20) {
        meaningfulInsights.push({ category, value, count, percentage });
      }
    });
  });

  // Sort by count (descending)
  meaningfulInsights.sort((a, b) => b.count - a.count);

  if (meaningfulInsights.length === 0) {
    return null;
  }

  // Group by category
  const groupedInsights: Record<string, Array<{ value: string; count: number; percentage: number }>> = {};
  meaningfulInsights.forEach((insight) => {
    if (!groupedInsights[insight.category]) {
      groupedInsights[insight.category] = [];
    }
    groupedInsights[insight.category].push({
      value: insight.value,
      count: insight.count,
      percentage: insight.percentage,
    });
  });

  const getIcon = (category: string) => {
    const lower = category.toLowerCase();
    if (lower.includes('meal') || lower.includes('dinner') || lower.includes('lunch')) {
      return '🍽️';
    }
    if (lower.includes('price') || lower.includes('cost')) {
      return '💰';
    }
    if (lower.includes('parking')) {
      return '🅿️';
    }
    if (lower.includes('noise')) {
      return '🔇';
    }
    if (lower.includes('group') || lower.includes('size')) {
      return '👥';
    }
    if (lower.includes('service')) {
      return '🤝';
    }
    if (lower.includes('vegetarian')) {
      return '🥗';
    }
    return '📊';
  };

  return (
    <section className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Review Insights</h2>
      <p className="text-sm text-gray-600 mb-4">
        Common patterns from {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
      </p>
      <div className="space-y-4">
        {Object.entries(groupedInsights).map(([category, values]) => (
          <div key={category} className="border-b border-gray-100 last:border-b-0 pb-4 last:pb-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">{getIcon(category)}</span>
              <h3 className="font-semibold text-gray-900">{category}</h3>
            </div>
            <div className="space-y-2">
              {values.slice(0, 3).map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-gray-700">{item.value}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-[var(--surface2)]0 h-2 rounded-full transition-all"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-600 w-16 text-right">
                      {item.count} ({Math.round(item.percentage)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
