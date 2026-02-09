const isDev = process.env.NODE_ENV !== 'production';

export async function withTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
  timeoutMs = isDev ? 12000 : 8000
): Promise<{ result: T; timedOut: boolean; durationMs: number; error?: string }> {
  const start = Date.now();
  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${label} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return { result, timedOut: false, durationMs: Date.now() - start };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.startsWith('TIMEOUT:')) {
      if (isDev) console.warn(`[timeout] ${errorMessage}`);
      return { result: fallback, timedOut: true, durationMs: Date.now() - start, error: errorMessage };
    }
    if (isDev) console.warn(`[timeout] ${label} failed: ${errorMessage}`);
    return { result: fallback, timedOut: false, durationMs: Date.now() - start, error: errorMessage };
  }
}
