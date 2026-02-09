/**
 * Rate Limit Manager for LLM API calls
 * Handles Groq and Gemini with proper backoff, proactive throttling, and adaptive concurrency
 */

export type ProviderName = 'gemini' | 'groq';

interface RateLimitHeaders {
  retryAfter?: number; // seconds
  resetRequests?: number; // seconds until request limit resets
  resetTokens?: number; // seconds until token limit resets
  remainingRequests?: number;
  remainingTokens?: number;
  limitRequests?: number;
  limitTokens?: number;
}

interface ProviderHealth {
  unhealthyUntil: number;
  lastError: string | null;
  consecutive429s: number;
  last429Time: number;
}

interface RateLimitStats {
  total429s: number;
  totalSleepMs: number;
  sleepCount: number;
  lastStatsPrintTime: number;
}

interface RateLimitEvent {
  timestamp: number;
  provider: ProviderName;
  sleepMs: number;
}

const CHARS_PER_TOKEN = 4; // rough estimate
const SAFETY_MARGIN_TOKENS = 100;
const MAX_BACKOFF_MS = 5000; // reduced - upgraded Groq account has higher limits
const GEMINI_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes for Gemini (not used anymore)
const GROQ_COOLDOWN_MS = 30 * 1000; // 30 seconds for Groq (upgraded account)
const GROQ_CONSECUTIVE_429_THRESHOLD = 5; // More tolerant - upgraded account
const STATS_PRINT_INTERVAL_MS = 60000; // print stats every 60s
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window for adaptive concurrency
const CONCURRENCY_DECREASE_THRESHOLD = 5; // More tolerant - upgraded account
const CONCURRENCY_INCREASE_WAIT_MS = 30000; // 30 seconds without 429s to increase (faster recovery)

class RateLimitManager {
  private providerHealth: Record<ProviderName, ProviderHealth> = {
    gemini: { unhealthyUntil: 0, lastError: null, consecutive429s: 0, last429Time: 0 },
    groq: { unhealthyUntil: 0, lastError: null, consecutive429s: 0, last429Time: 0 }
  };

  private groqTokenState = {
    remainingTokens: Infinity,
    resetTime: 0,
    remainingRequests: Infinity,
    resetRequestsTime: 0
  };

  private stats: RateLimitStats = {
    total429s: 0,
    totalSleepMs: 0,
    sleepCount: 0,
    lastStatsPrintTime: Date.now()
  };

  private recentRateLimitEvents: RateLimitEvent[] = [];
  private globalSleepPromise: Promise<void> | null = null;
  private currentConcurrency: number;
  private maxConcurrency: number;
  private lastConcurrencyIncrease: number = 0;

  constructor(maxConcurrency: number) {
    this.maxConcurrency = maxConcurrency;
    this.currentConcurrency = maxConcurrency;
  }

  getConcurrency(): number {
    return this.currentConcurrency;
  }

  /**
   * Parse Groq rate limit headers correctly
   * Headers like x-ratelimit-reset-tokens can be "7.25s" or just "7.25" (seconds)
   */
  parseGroqHeaders(headers: Headers): RateLimitHeaders {
    const result: RateLimitHeaders = {};

    // Retry-After header (seconds)
    const retryAfter = headers.get('retry-after');
    if (retryAfter) {
      const parsed = parseFloat(retryAfter);
      if (!isNaN(parsed)) {
        result.retryAfter = parsed;
      }
    }

    // x-ratelimit-reset-requests (e.g., "6s" or "6")
    const resetRequests = headers.get('x-ratelimit-reset-requests');
    if (resetRequests) {
      result.resetRequests = this.parseSecondsValue(resetRequests);
    }

    // x-ratelimit-reset-tokens (e.g., "5.58s" or "5.58")
    const resetTokens = headers.get('x-ratelimit-reset-tokens');
    if (resetTokens) {
      result.resetTokens = this.parseSecondsValue(resetTokens);
    }

    // x-ratelimit-remaining-requests
    const remainingRequests = headers.get('x-ratelimit-remaining-requests');
    if (remainingRequests) {
      result.remainingRequests = parseInt(remainingRequests, 10);
    }

    // x-ratelimit-remaining-tokens
    const remainingTokens = headers.get('x-ratelimit-remaining-tokens');
    if (remainingTokens) {
      result.remainingTokens = parseInt(remainingTokens, 10);
    }

    // x-ratelimit-limit-requests
    const limitRequests = headers.get('x-ratelimit-limit-requests');
    if (limitRequests) {
      result.limitRequests = parseInt(limitRequests, 10);
    }

    // x-ratelimit-limit-tokens
    const limitTokens = headers.get('x-ratelimit-limit-tokens');
    if (limitTokens) {
      result.limitTokens = parseInt(limitTokens, 10);
    }

    return result;
  }

  /**
   * Parse values like "6s", "5.58s", "6", "5.58" into seconds
   */
  private parseSecondsValue(value: string): number {
    // Remove 's' suffix if present
    const cleaned = value.replace(/s$/i, '').trim();
    const parsed = parseFloat(cleaned);
    
    if (isNaN(parsed)) return 0;
    
    // If value is very large (> 1e9), it might be a timestamp - convert to seconds from now
    if (parsed > 1e9) {
      const now = Date.now();
      const diffMs = parsed - (parsed > 1e12 ? now : now / 1000 * 1000);
      return Math.max(0, diffMs / 1000);
    }
    
    return parsed;
  }

  /**
   * Calculate optimal sleep time from headers
   */
  calculateSleepMs(headers: RateLimitHeaders, attempt: number = 0): number {
    // Prefer Retry-After if present
    if (headers.retryAfter !== undefined && headers.retryAfter > 0) {
      const sleepMs = headers.retryAfter * 1000;
      return Math.min(sleepMs, MAX_BACKOFF_MS * 3) + this.jitter(250);
    }

    // Use max of reset-requests and reset-tokens
    const resetRequestsMs = (headers.resetRequests || 0) * 1000;
    const resetTokensMs = (headers.resetTokens || 0) * 1000;
    const headerBasedMs = Math.max(resetRequestsMs, resetTokensMs);

    if (headerBasedMs > 0) {
      const sleepMs = headerBasedMs + this.jitter(250);
      
      // Warn if calculated sleep is way off from headers
      const exponentialBackoff = Math.min(2000 * Math.pow(2, attempt), MAX_BACKOFF_MS);
      if (sleepMs > exponentialBackoff * 5 && sleepMs > 10000) {
        console.warn(`[rate-limit] WARNING: calculated sleep ${sleepMs}ms > 5x exponential backoff ${exponentialBackoff}ms`);
      }
      
      return Math.min(sleepMs, MAX_BACKOFF_MS) + this.jitter(250);
    }

    // Fallback to exponential backoff (capped at MAX_BACKOFF_MS)
    return Math.min(2000 * Math.pow(2, attempt), MAX_BACKOFF_MS) + this.jitter(250);
  }

  private jitter(maxMs: number): number {
    return Math.floor(Math.random() * maxMs);
  }

  /**
   * Estimate tokens for a request
   */
  estimateTokens(prompt: string, maxOutputTokens: number): number {
    const promptTokens = Math.ceil(prompt.length / CHARS_PER_TOKEN);
    return promptTokens + maxOutputTokens + SAFETY_MARGIN_TOKENS;
  }

  /**
   * Update Groq token state from response headers
   */
  updateGroqState(headers: RateLimitHeaders): void {
    const now = Date.now();

    if (headers.remainingTokens !== undefined) {
      this.groqTokenState.remainingTokens = headers.remainingTokens;
    }
    if (headers.resetTokens !== undefined) {
      this.groqTokenState.resetTime = now + headers.resetTokens * 1000;
    }
    if (headers.remainingRequests !== undefined) {
      this.groqTokenState.remainingRequests = headers.remainingRequests;
    }
    if (headers.resetRequests !== undefined) {
      this.groqTokenState.resetRequestsTime = now + headers.resetRequests * 1000;
    }
  }

  /**
   * Check if we should proactively wait before sending a Groq request
   * Returns ms to wait, or 0 if OK to proceed
   */
  shouldWaitForGroq(estimatedTokens: number): number {
    const now = Date.now();

    // If we have token info and it's too low, wait until reset
    if (this.groqTokenState.remainingTokens < estimatedTokens) {
      if (this.groqTokenState.resetTime > now) {
        const waitMs = this.groqTokenState.resetTime - now + this.jitter(100);
        return Math.min(waitMs, MAX_BACKOFF_MS);
      }
    }

    // If we're out of requests, wait
    if (this.groqTokenState.remainingRequests <= 0) {
      if (this.groqTokenState.resetRequestsTime > now) {
        const waitMs = this.groqTokenState.resetRequestsTime - now + this.jitter(100);
        return Math.min(waitMs, MAX_BACKOFF_MS);
      }
    }

    return 0;
  }

  /**
   * Check if a provider is healthy
   */
  isHealthy(provider: ProviderName): boolean {
    return Date.now() >= this.providerHealth[provider].unhealthyUntil;
  }

  /**
   * Mark provider as unhealthy (circuit breaker)
   */
  markUnhealthy(provider: ProviderName, error: string): void {
    this.providerHealth[provider].unhealthyUntil = Date.now() + HEALTH_COOLDOWN_MS;
    this.providerHealth[provider].lastError = error;
    console.log(`[circuit-breaker] ${provider} marked unhealthy for ${HEALTH_COOLDOWN_MS / 1000}s: ${error}`);
  }

  /**
   * Record a 429 event - Gemini triggers immediate cooldown, Groq uses consecutive threshold
   */
  record429(provider: ProviderName, headers: RateLimitHeaders, sleepMs: number): void {
    const now = Date.now();
    const health = this.providerHealth[provider];

    health.consecutive429s++;
    health.last429Time = now;
    this.stats.total429s++;

    // Track for adaptive concurrency
    this.recentRateLimitEvents.push({ timestamp: now, provider, sleepMs });
    this.pruneRateLimitEvents();

    if (provider === 'gemini') {
      // GEMINI: Immediate cooldown on ANY 429 (quota signal, not transient)
      const cooldownUntil = now + GEMINI_COOLDOWN_MS;
      health.unhealthyUntil = cooldownUntil;
      health.lastError = 'Gemini quota exhausted (429)';
      health.consecutive429s = 0;
      
      console.log(JSON.stringify({
        event: '429',
        provider: 'gemini',
        status: 429,
        cooldownUntil: new Date(cooldownUntil).toISOString(),
        cooldownMs: GEMINI_COOLDOWN_MS,
        message: 'Gemini quota exhausted, disabled for 10 minutes'
      }));
    } else {
      // GROQ: Log structured 429 info with headers
      console.log(JSON.stringify({
        event: '429',
        provider: 'groq',
        retryAfter: headers.retryAfter,
        resetTokens: headers.resetTokens,
        resetRequests: headers.resetRequests,
        remainingTokens: headers.remainingTokens,
        remainingRequests: headers.remainingRequests,
        chosenSleepMs: sleepMs,
        consecutive429s: health.consecutive429s
      }));

      // GROQ: Circuit breaker after consecutive 429s
      if (health.consecutive429s >= GROQ_CONSECUTIVE_429_THRESHOLD) {
        health.unhealthyUntil = now + GROQ_COOLDOWN_MS;
        health.lastError = `${GROQ_CONSECUTIVE_429_THRESHOLD} consecutive 429s`;
        health.consecutive429s = 0;
        console.log(`[circuit-breaker] Groq marked unhealthy for ${GROQ_COOLDOWN_MS / 1000}s`);
      }
    }

    // Adaptive concurrency: decrease if too many 429s
    this.adaptConcurrency();
  }

  /**
   * Mark Gemini 429 - immediate 10 minute cooldown (do NOT retry)
   */
  markGemini429(): void {
    this.record429('gemini', {}, 0);
  }

  /**
   * Record successful request (resets consecutive 429 counter)
   */
  recordSuccess(provider: ProviderName): void {
    this.providerHealth[provider].consecutive429s = 0;
    
    // Try to increase concurrency if no recent 429s
    this.adaptConcurrency();
  }

  /**
   * Remove old rate limit events from tracking
   */
  private pruneRateLimitEvents(): void {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    this.recentRateLimitEvents = this.recentRateLimitEvents.filter(e => e.timestamp > cutoff);
  }

  /**
   * Adapt concurrency based on rate limit events
   */
  private adaptConcurrency(): void {
    this.pruneRateLimitEvents();
    const now = Date.now();

    // Decrease if too many 429s in the last minute
    if (this.recentRateLimitEvents.length >= CONCURRENCY_DECREASE_THRESHOLD && this.currentConcurrency > 1) {
      this.currentConcurrency = Math.max(1, this.currentConcurrency - 1);
      console.log(`[adaptive] Decreased concurrency to ${this.currentConcurrency} (${this.recentRateLimitEvents.length} 429s in last minute)`);
      return;
    }

    // Increase if no 429s for 2 minutes and not at max
    const oldestAllowed = now - CONCURRENCY_INCREASE_WAIT_MS;
    const recent429s = this.recentRateLimitEvents.filter(e => e.timestamp > oldestAllowed);
    
    if (recent429s.length === 0 && 
        this.currentConcurrency < this.maxConcurrency &&
        now - this.lastConcurrencyIncrease > CONCURRENCY_INCREASE_WAIT_MS) {
      this.currentConcurrency = Math.min(this.maxConcurrency, this.currentConcurrency + 1);
      this.lastConcurrencyIncrease = now;
      console.log(`[adaptive] Increased concurrency to ${this.currentConcurrency}`);
    }
  }

  /**
   * Global coordinated sleep - ensures only one sleep is active at a time
   */
  async globalSleep(ms: number, reason: string): Promise<void> {
    // If there's already a sleep in progress, wait for it instead of adding more
    if (this.globalSleepPromise) {
      console.log(`[rate-limit] Joining existing sleep (reason: ${reason})`);
      await this.globalSleepPromise;
      return;
    }

    console.log(`[rate-limit] Sleeping ${ms}ms (reason: ${reason})`);
    this.stats.sleepCount++;
    this.stats.totalSleepMs += ms;

    this.globalSleepPromise = new Promise(resolve => setTimeout(resolve, ms));
    await this.globalSleepPromise;
    this.globalSleepPromise = null;
  }

  /**
   * Print stats periodically
   */
  maybePrintStats(): void {
    const now = Date.now();
    if (now - this.stats.lastStatsPrintTime >= STATS_PRINT_INTERVAL_MS) {
      const avgSleepMs = this.stats.sleepCount > 0 
        ? Math.round(this.stats.totalSleepMs / this.stats.sleepCount) 
        : 0;
      
      console.log(JSON.stringify({
        event: 'stats',
        total429s: this.stats.total429s,
        totalSleepMs: this.stats.totalSleepMs,
        sleepCount: this.stats.sleepCount,
        avgSleepMs,
        currentConcurrency: this.currentConcurrency,
        geminiHealthy: this.isHealthy('gemini'),
        groqHealthy: this.isHealthy('groq'),
        groqRemainingTokens: this.groqTokenState.remainingTokens
      }));

      this.stats.lastStatsPrintTime = now;
    }
  }

  /**
   * Get provider health status
   */
  getHealthStatus(): Record<ProviderName, { healthy: boolean; unhealthyUntil: number; lastError: string | null }> {
    return {
      gemini: {
        healthy: this.isHealthy('gemini'),
        unhealthyUntil: this.providerHealth.gemini.unhealthyUntil,
        lastError: this.providerHealth.gemini.lastError
      },
      groq: {
        healthy: this.isHealthy('groq'),
        unhealthyUntil: this.providerHealth.groq.unhealthyUntil,
        lastError: this.providerHealth.groq.lastError
      }
    };
  }
}

// Singleton instance
let instance: RateLimitManager | null = null;

export function getRateLimitManager(maxConcurrency: number = 3): RateLimitManager {
  if (!instance) {
    instance = new RateLimitManager(maxConcurrency);
  }
  return instance;
}

export function resetRateLimitManager(): void {
  instance = null;
}

export { RateLimitManager, RateLimitHeaders };
