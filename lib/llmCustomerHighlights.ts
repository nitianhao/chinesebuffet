import { lookupStateShard } from '@/lib/loadStateShard';

type LlmCustomerHighlightsDraft = {
  items: string[];
  generatedAt: string;
  sourceMethod: string;
};

export function getLlmCustomerHighlightsDraft(pathname: string): LlmCustomerHighlightsDraft | null {
  const draft = lookupStateShard<LlmCustomerHighlightsDraft>('customer-highlights', pathname);
  if (!draft || !Array.isArray(draft.items) || draft.items.length === 0) {
    return null;
  }
  return draft;
}
