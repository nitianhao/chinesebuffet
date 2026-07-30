import { lookupStateShard } from '@/lib/loadStateShard';

type LlmSeoSummaryDraft = {
  summary: string;
  status: 'draft';
  qaStatus: 'accepted';
  wordCount: number;
  sourceMethod: string;
  generatedAt: string;
};

export function getLlmSeoSummaryDraft(pathname: string): LlmSeoSummaryDraft | null {
  const draft = lookupStateShard<LlmSeoSummaryDraft>('seo-summary-drafts', pathname);
  if (!draft || draft.status !== 'draft' || draft.qaStatus !== 'accepted') {
    return null;
  }
  return draft;
}
