'use client';

interface OwnerUpdate {
  updateText?: string;
  updateDate?: string;
  [key: string]: any;
}

interface OwnerUpdatesProps {
  updates: OwnerUpdate[];
}

export default function OwnerUpdates({ updates }: OwnerUpdatesProps) {
  if (!updates || updates.length === 0) {
    return null;
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (e) {
      return null;
    }
  };

  return (
    <div className="space-y-4">
      {updates.map((update, index) => (
        <div
          key={index}
          className="bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-blue-900">Business Owner</span>
                {update.updateDate && (
                  <span className="text-xs text-blue-700">
                    {formatDate(update.updateDate) || update.updateDate}
                  </span>
                )}
              </div>
              {update.updateText && (
                <p className="text-blue-800 whitespace-pre-line leading-relaxed">
                  {update.updateText}
                </p>
              )}
              {!update.updateText && Object.keys(update).some(k => k !== 'updateDate') && (
                <p className="text-blue-800">
                  {JSON.stringify(update)}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
