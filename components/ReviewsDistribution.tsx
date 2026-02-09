interface ReviewsDistributionProps {
  distribution: {
    oneStar?: number;
    twoStar?: number;
    threeStar?: number;
    fourStar?: number;
    fiveStar?: number;
  };
  totalReviews: number;
}

export default function ReviewsDistribution({ distribution, totalReviews }: ReviewsDistributionProps) {
  if (!distribution || totalReviews === 0) {
    return null;
  }

  const stars = [
    { label: '5', count: distribution.fiveStar || 0, value: 5 },
    { label: '4', count: distribution.fourStar || 0, value: 4 },
    { label: '3', count: distribution.threeStar || 0, value: 3 },
    { label: '2', count: distribution.twoStar || 0, value: 2 },
    { label: '1', count: distribution.oneStar || 0, value: 1 },
  ];

  const maxCount = Math.max(...stars.map(s => s.count));

  return (
    <div className="space-y-2">
      {stars.map((star) => {
        const percentage = maxCount > 0 ? (star.count / maxCount) * 100 : 0;
        const reviewPercentage = totalReviews > 0 ? (star.count / totalReviews) * 100 : 0;
        
        return (
          <div key={star.value} className="flex items-center gap-3">
            <div className="flex items-center gap-1 w-8">
              <span className="text-yellow-500 text-sm">★</span>
              <span className="text-sm font-medium text-gray-700 w-4">{star.label}</span>
            </div>
            <div className="flex-1">
              <div className="relative h-6 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full bg-yellow-500 transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 w-24 justify-end">
              <span className="text-sm text-gray-600 font-medium">{star.count}</span>
              <span className="text-xs text-gray-500">({reviewPercentage.toFixed(0)}%)</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
