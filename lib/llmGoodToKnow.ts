import { lookupStateShard } from '@/lib/loadStateShard';

type LlmGoodToKnowDraft = {
  items: string[];
  generatedAt: string;
  sourceMethod: string;
};

export function getLlmGoodToKnowDraft(pathname: string): LlmGoodToKnowDraft | null {
  const draft = lookupStateShard<LlmGoodToKnowDraft>('good-to-know', pathname);
  if (!draft || !Array.isArray(draft.items) || draft.items.length === 0) {
    return null;
  }
  return draft;
}
