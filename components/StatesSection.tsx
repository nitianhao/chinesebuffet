'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function StatesSection() {
  const [stateCounts, setStateCounts] = useState<Record<string, number> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Lazy load state counts after component mounts
    fetch('/api/states')
      .then(res => res.json())
      .then(data => {
        if (data.stateCounts) {
          setStateCounts(data.stateCounts);
        }
      })
      .catch(err => {
        console.error('Error loading state counts:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <section className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Browse by State
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[...Array(24)].map((_, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 text-center animate-pulse">
                <div className="h-6 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-16 mx-auto"></div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!stateCounts) {
    return null;
  }

  const stateAbbrs = Object.keys(stateCounts).sort();

  return (
    <section className="bg-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Browse by State
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {stateAbbrs.slice(0, 24).map((stateAbbr) => {
            const buffetCount = stateCounts[stateAbbr] || 0;
            return (
              <Link
                key={stateAbbr}
                href={`/chinese-buffets/states/${stateAbbr.toLowerCase()}`}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow text-center"
              >
                <div className="font-semibold text-lg text-gray-900 mb-1">
                  {stateAbbr}
                </div>
                <div className="text-gray-600 text-sm">
                  {buffetCount} buffets
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}




