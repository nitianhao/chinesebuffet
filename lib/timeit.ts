/**
 * Performance timing and timeout utilities for debugging data fetches.
 */

const isDev = process.env.NODE_ENV !== 'production';
const DEV_TIMEOUT = 3000; // 3s timeout in dev
const PROD_TIMEOUT = 8000; // 8s timeout in prod

/**
 * Wraps an async function with timing and logging (dev-only logs).
 * Returns the result along with timing info.
 */
export async function timeit<T>(
  label: string,
  fn: () => Promise<T>,
  options?: { 
    logResult?: boolean;
    summaryFn?: (result: T) => string;
  }
): Promise<{ result: T; durationMs: number; timedOut: boolean }> {
  const start = Date.now();
  
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    
    if (isDev) {
      const summary = options?.summaryFn ? options.summaryFn(result) : '';
      console.log(`[timeit] ${label}: ${durationMs}ms${summary ? ` - ${summary}` : ''}`);
    }
    
    return { result, durationMs, timedOut: false };
  } catch (error) {
    const durationMs = Date.now() - start;
    if (isDev) {
      console.error(`[timeit] ${label}: FAILED after ${durationMs}ms`, error);
    }
    throw error;
  }
}

/**
 * Wraps an async function with a timeout. 
 * If the function takes longer than the timeout, returns a fallback value.
 */
export async function withTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
  timeoutMs?: number
): Promise<{ result: T; durationMs: number; timedOut: boolean }> {
  const timeout = timeoutMs ?? (isDev ? DEV_TIMEOUT : PROD_TIMEOUT);
  const start = Date.now();
  
  let timeoutId: NodeJS.Timeout | null = null;
  
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${label} exceeded ${timeout}ms`));
    }, timeout);
  });
  
  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    
    const durationMs = Date.now() - start;
    if (isDev) {
      console.log(`[withTimeout] ${label}: ${durationMs}ms (timeout: ${timeout}ms)`);
    }
    
    return { result, durationMs, timedOut: false };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const durationMs = Date.now() - start;
    
    if (error instanceof Error && error.message.startsWith('TIMEOUT:')) {
      if (isDev) {
        console.warn(`[withTimeout] ${label}: TIMED OUT after ${durationMs}ms`);
      }
      return { result: fallback, durationMs, timedOut: true };
    }
    
    // Non-timeout error - re-throw in production, return fallback in dev
    if (isDev) {
      console.error(`[withTimeout] ${label}: ERROR after ${durationMs}ms`, error);
      return { result: fallback, durationMs, timedOut: false };
    }
    throw error;
  }
}

/**
 * Debug info for hub pages when data is empty.
 */
export interface DebugInfo {
  table: string;
  fields: string[];
  sampleKeys?: string[];
  error?: string;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Creates debug info object for displaying in dev mode.
 */
export function createDebugInfo(
  table: string,
  fields: string[],
  durationMs: number,
  timedOut: boolean,
  sampleData?: Record<string, any>,
  error?: string
): DebugInfo {
  return {
    table,
    fields,
    sampleKeys: sampleData ? Object.keys(sampleData).slice(0, 10) : undefined,
    error,
    durationMs,
    timedOut,
  };
}
