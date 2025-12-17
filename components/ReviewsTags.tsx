'use client';

interface ReviewTag {
  title: string;
  count: number;
}

interface ReviewsTagsProps {
  tags: ReviewTag[];
}

export default function ReviewsTags({ tags }: ReviewsTagsProps) {
  if (!tags || tags.length === 0) {
    return null;
  }

  // Sort by count descending and take top tags
  const topTags = [...tags].sort((a, b) => b.count - a.count).slice(0, 12);

  return (
    <div className="flex flex-wrap gap-2">
      {topTags.map((tag, index) => (
        <span
          key={index}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
        >
          <span>{tag.title}</span>
          {tag.count > 1 && (
            <span className="text-xs bg-blue-200 text-blue-800 rounded-full px-1.5 py-0.5">
              {tag.count}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
