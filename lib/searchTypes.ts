export type SearchResult = {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  neighborhood?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  thumbUrl?: string | null;
  citySlug?: string | null;
};

export type SearchCityResult = {
  id: string;
  city: string;
  stateAbbr: string;
  slug: string;
  population?: number;
};

export type SearchResponse = {
  q: string;
  tookMs: number;
  results: SearchResult[]; // Buffets (kept for backward compatibility)
  cities?: SearchCityResult[]; // Cities matching query
};

export type SearchSuggestionPlace = {
  name: string;
  slug: string;
  city: string;
  state: string;
  citySlug: string | null;
};

export type SearchSuggestionsResponse = {
  citySlug: string | null;
  suggestions: {
    popularQueries: string[];
    popularPlaces: SearchSuggestionPlace[];
  };
};
