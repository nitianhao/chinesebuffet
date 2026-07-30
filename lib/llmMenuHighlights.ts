import { lookupStateShard } from '@/lib/loadStateShard';

type LlmMenuHighlightsDraft = {
  items: string[];
  generatedAt: string;
  sourceMethod: string;
};

export function getLlmMenuHighlightsDraft(pathname: string): LlmMenuHighlightsDraft | null {
  const draft = lookupStateShard<LlmMenuHighlightsDraft>('menu-highlights', pathname);
  if (!draft || !Array.isArray(draft.items) || draft.items.length === 0) {
    return null;
  }
  return draft;
}
