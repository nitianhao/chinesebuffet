import { request } from 'undici';
import { logger } from './logger.js';
import { randomDelay } from './delay.js';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface FetchOptions {
  timeout?: number;
  retries?: number;
  userAgent?: string;
  headers?: Record<string, string>;
}

export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<{ statusCode: number; body: string; headers: Record<string, string> }> {
  const {
    timeout = 30000,
    retries = 3,
    userAgent = process.env.USER_AGENT || DEFAULT_USER_AGENT,
    headers = {}
  } = options;

  const requestHeaders = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    ...headers
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        logger.debug({ url, attempt }, `Retrying after ${backoffDelay}ms`);
        await randomDelay(backoffDelay, backoffDelay * 1.5);
      }

      const response = await request(url, {
        method: 'GET',
        headers: requestHeaders,
        maxRedirections: 5,
        requestTimeout: timeout
      });

      const statusCode = response.statusCode;
      const body = await response.body.text();

      // Check for blocking indicators
      if (statusCode === 403 || statusCode === 429) {
        throw new Error(`Blocked by server: HTTP ${statusCode}`);
      }

      if (statusCode >= 500 && statusCode < 600) {
        throw new Error(`Server error: HTTP ${statusCode}`);
      }

      if (statusCode !== 200) {
        throw new Error(`Unexpected status: HTTP ${statusCode}`);
      }

      // Check for captcha or blocking in HTML
      if (body.includes('captcha') || body.includes('blocked') || body.includes('access denied')) {
        throw new Error('Blocked: captcha or access denied detected');
      }

      return {
        statusCode,
        body,
        headers: response.headers as Record<string, string>
      };
    } catch (error: any) {
      lastError = error;
      
      if (error.name === 'AbortError') {
        logger.warn({ url, attempt }, 'Request timeout');
      } else if (error.message?.includes('Blocked')) {
        // Don't retry on blocking
        throw error;
      } else {
        logger.warn({ url, attempt, error: error.message }, 'Request failed, will retry');
      }

      if (attempt === retries) {
        break;
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}
