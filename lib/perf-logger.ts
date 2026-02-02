/**
 * Lightweight server-side perf logging for buffet detail page baseline.
 * Logs only in dev or when PERF_LOG=true.
 */

const PERF_LOG =
  process.env.NODE_ENV === 'development' || process.env.PERF_LOG === 'true';

const timings: Array<{ label: string; ms: number }> = [];

export function perfReset(): void {
  if (PERF_LOG) timings.length = 0;
}

export function perfStart(label: string): () => void {
  if (!PERF_LOG) return () => {};
  console.time(`[perf] ${label}`);
  const start = performance.now();
  return () => {
    const ms = Math.round(performance.now() - start);
    timings.push({ label, ms });
    console.timeEnd(`[perf] ${label}`);
  };
}

export function perfSummary(totalMs: number): void {
  if (!PERF_LOG || timings.length === 0) return;
  const sorted = [...timings].sort((a, b) => b.ms - a.ms).slice(0, 5);
  console.log('[perf] ─── Top 5 slowest steps ───');
  sorted.forEach(({ label, ms }, i) => {
    console.log(`[perf]   ${i + 1}. ${label}: ${ms}ms`);
  });
  console.log(`[perf] Total page: ${totalMs}ms`);
  timings.length = 0;
}

export { PERF_LOG };
