'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type SavedBuffet = {
  slug: string;
  citySlug: string;
  name: string;
  city: string;
  stateAbbr: string;
  rating?: number | null;
  reviewCount?: number | null;
  price?: string | null;
};

const STORAGE_KEY = 'cb_saved_buffets_v1';
const CHANGE_EVENT = 'saved-buffets:change';

function getKey(item: Pick<SavedBuffet, 'citySlug' | 'slug'>) {
  return `${item.citySlug}:${item.slug}`;
}

function readSaved(): SavedBuffet[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedBuffet[]) : [];
  } catch {
    return [];
  }
}

function writeSaved(items: SavedBuffet[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useSavedBuffets() {
  const [saved, setSaved] = useState<SavedBuffet[]>([]);

  useEffect(() => {
    setSaved(readSaved());
    const onStorage = () => setSaved(readSaved());
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, onStorage);
    };
  }, []);

  const isSaved = useCallback((item: Pick<SavedBuffet, 'citySlug' | 'slug'>) => {
    const key = getKey(item);
    return saved.some((entry) => getKey(entry) === key);
  }, [saved]);

  const toggleSaved = useCallback((item: SavedBuffet) => {
    setSaved((prev) => {
      const key = getKey(item);
      const exists = prev.some((entry) => getKey(entry) === key);
      const next = exists ? prev.filter((entry) => getKey(entry) !== key) : [item, ...prev];
      writeSaved(next);
      return next;
    });
  }, []);

  const sorted = useMemo(() => saved, [saved]);

  return { saved: sorted, isSaved, toggleSaved };
}
