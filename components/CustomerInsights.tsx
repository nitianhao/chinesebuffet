// Component to display customer insights in markdown-style format
// Converts **bold** text to <strong> tags and handles line breaks

interface CustomerInsightsProps {
  content: string;
}

export default function CustomerInsights({ content }: CustomerInsightsProps) {
  if (!content) return null;

  // Process the content to handle bold text and line breaks
  const processContent = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim() || line === '');
    return lines.map((line, lineIndex) => {
      // Empty lines become spacing
      if (!line.trim()) {
        return <div key={lineIndex} className="h-4" />;
      }
      
      // Split by **bold** markers
      const segments = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={lineIndex} className={lineIndex > 0 && lines[lineIndex - 1].trim() ? 'mt-4' : ''}>
          {segments.map((segment, segIndex) => {
            if (segment.startsWith('**') && segment.endsWith('**')) {
              // Remove ** markers and make bold
              const boldText = segment.slice(2, -2);
              return <strong key={segIndex} className="font-semibold text-gray-900">{boldText}</strong>;
            }
            return <span key={segIndex}>{segment}</span>;
          })}
        </p>
      );
    });
  };

  return (
    <div className="prose prose-sm sm:prose-base max-w-none">
      <div className="text-gray-700 leading-relaxed text-base sm:text-lg">
        {processContent(content)}
      </div>
    </div>
  );
}





















