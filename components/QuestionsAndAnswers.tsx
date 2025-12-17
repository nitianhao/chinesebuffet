'use client';

interface QnAItem {
  question?: string;
  answer?: string;
  answerDate?: string;
  questionDate?: string;
  [key: string]: any;
}

interface QuestionsAndAnswersProps {
  qna: QnAItem[];
}

export default function QuestionsAndAnswers({ qna }: QuestionsAndAnswersProps) {
  if (!qna || qna.length === 0) {
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
      {qna.map((item, index) => (
        <div
          key={index}
          className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
        >
          {/* Question */}
          {item.question && (
            <div className="mb-3">
              <div className="flex items-start gap-2 mb-1">
                <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{item.question}</h4>
                  {item.questionDate && (
                    <span className="text-xs text-gray-500 mt-1 block">
                      Asked {formatDate(item.questionDate) || item.questionDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Answer */}
          {item.answer && (
            <div className="ml-7 pl-4 border-l-2 border-blue-200">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-gray-700 whitespace-pre-line">{item.answer}</p>
                  {item.answerDate && (
                    <span className="text-xs text-gray-500 mt-2 block">
                      Answered {formatDate(item.answerDate) || item.answerDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Question without answer */}
          {item.question && !item.answer && (
            <div className="ml-7 text-sm text-gray-500 italic">
              No answer yet
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
