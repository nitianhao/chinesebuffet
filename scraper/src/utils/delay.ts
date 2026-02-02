/**
 * Sleep for a random duration between min and max milliseconds
 */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Exponential backoff delay
 */
export function exponentialBackoff(attempt: number, baseMs: number = 1000, maxMs: number = 60000): number {
  const delay = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  // Add jitter (random 0-30% of delay)
  const jitter = delay * 0.3 * Math.random();
  return Math.floor(delay + jitter);
}
