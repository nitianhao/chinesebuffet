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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface2)] text-[var(--accent1)] text-sm font-medium hover:bg-[var(--surface)] transition-colors"
        >
          <span>{tag.title}</span>
          {tag.count > 1 && (
            <span className="text-xs bg-[var(--accent-medium)] text-[var(--accent1)] rounded-full px-1.5 py-0.5">
              {tag.count}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
