import * as cheerio from 'cheerio';
import { fetchWithRetry } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { randomDelay } from '../utils/delay.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

export interface TripAdvisorReview {
  ta_review_id: string | null;
  ta_author: string | null;
  ta_author_location: string | null;
  rating: number | null;
  title: string | null;
  text: string | null;
  visited_date: string | null;
  published_date: string | null;
  language: string | null;
}

/**
 * Extract reviews from a TripAdvisor restaurant page
 */
export async function scrapeTripAdvisorReviews(
  taUrl: string,
  placeId: string,
  maxPages: number = 10
): Promise<TripAdvisorReview[]> {
  const reviews: TripAdvisorReview[] = [];
  let currentPage = 0;

  // Extract base URL and location ID
  const baseUrl = taUrl.split('-Reviews-')[0] + '-Reviews-';
  const locationMatch = taUrl.match(/Restaurant_Review-g(\d+)-/);
  const locationId = locationMatch ? locationMatch[1] : null;

  while (currentPage < maxPages) {
    try {
      // Build URL for current page
      let pageUrl: string;
      if (currentPage === 0) {
        pageUrl = taUrl;
      } else {
        // TripAdvisor pagination: -or{offset}.html
        const offset = currentPage * 10;
        pageUrl = `${baseUrl}or${offset}.html`;
      }

      logger.debug({ placeId, page: currentPage + 1, url: pageUrl }, 'Scraping reviews page');

      await randomDelay(3000, 6000);

      const { body } = await fetchWithRetry(pageUrl, {
        timeout: 30000,
        retries: 2
      });

      const $ = cheerio.load(body);
      const pageReviews = extractReviewsFromPage($, placeId);

      if (pageReviews.length === 0) {
        logger.debug({ placeId, page: currentPage + 1 }, 'No more reviews found');
        break;
      }

      reviews.push(...pageReviews);
      logger.info({ placeId, page: currentPage + 1, count: pageReviews.length }, 'Extracted reviews from page');

      // Check if there's a next page
      const nextPageLink = $('a.next').first();
      if (!nextPageLink.length || nextPageLink.hasClass('disabled')) {
        logger.debug({ placeId }, 'No more pages available');
        break;
      }

      currentPage++;
    } catch (error: any) {
      // Save raw HTML for debugging
      if (error.message?.includes('Blocked')) {
        saveRawHtml(placeId, `blocked-page-${currentPage}.html`, error.body || '');
        throw error;
      }

      logger.error({ placeId, page: currentPage + 1, error: error.message }, 'Failed to scrape page');
      
      // Save raw HTML for debugging failed parses
      try {
        saveRawHtml(placeId, `failed-page-${currentPage}.html`, error.body || '');
      } catch {}

      // Continue to next page on non-blocking errors
      if (currentPage === 0) {
        throw error; // Fail on first page
      }
      break;
    }
  }

  logger.info({ placeId, totalReviews: reviews.length }, 'Finished scraping reviews');
  return reviews;
}

function extractReviewsFromPage($: cheerio.CheerioAPI, placeId: string): TripAdvisorReview[] {
  const reviews: TripAdvisorReview[] = [];

  // TripAdvisor review containers (modern structure)
  const reviewContainers = $('div[data-test-target="HR_CC_CARD"], div.review-container, div[class*="review"]');

  if (reviewContainers.length === 0) {
    // Try alternative selectors
    const altContainers = $('div[data-automation="reviewCard"]');
    if (altContainers.length === 0) {
      logger.warn({ placeId }, 'No review containers found, page structure may have changed');
      return reviews;
    }
  }

  reviewContainers.each((_, element) => {
    try {
      const $review = $(element);

      // Extract review ID (from data-reviewid or href)
      const reviewId = $review.attr('data-reviewid') ||
                      $review.find('a[href*="/ShowUserReviews"]').attr('href')?.match(/d(\d+)/)?.[1] ||
                      null;

      // Extract author
      const author = $review.find('a[class*="username"], span[class*="username"]').first().text().trim() ||
                    $review.find('div[class*="info_text"]').first().find('div').first().text().trim() ||
                    null;

      // Extract author location
      const authorLocation = $review.find('span[class*="location"], div[class*="location"]').first().text().trim() ||
                            $review.find('div[class*="info_text"]').first().find('div').eq(1).text().trim() ||
                            null;

      // Extract rating (from class like "bubble_50", "bubble_40", etc. or data-rating)
      let rating: number | null = null;
      const ratingElement = $review.find('span[class*="bubble_"], svg[class*="bubble"]').first();
      const ratingClass = ratingElement.attr('class') || '';
      const ratingMatch = ratingClass.match(/bubble_(\d+)/);
      if (ratingMatch) {
        rating = parseInt(ratingMatch[1]) / 10;
      } else {
        const dataRating = ratingElement.attr('data-rating') || $review.attr('data-rating');
        if (dataRating) {
          rating = parseFloat(dataRating);
        }
      }

      // Extract title
      const title = $review.find('span[class*="noQuotes"], a[class*="title"]').first().text().trim() ||
                   $review.find('div[class*="quote"]').first().text().trim() ||
                   null;

      // Extract review text
      const text = $review.find('p[class*="partial_entry"], div[class*="entry"]').first().text().trim() ||
                  $review.find('span[class*="fullText"]').first().text().trim() ||
                  $review.find('div[class*="reviewText"]').first().text().trim() ||
                  null;

      // Extract dates
      let visitedDate: string | null = null;
      let publishedDate: string | null = null;

      const dateText = $review.find('span[class*="ratingDate"], div[class*="prw_rup"]').text();
      const dateMatch = dateText.match(/(\w+\s+\d{1,2},\s+\d{4})/);
      if (dateMatch) {
        publishedDate = dateMatch[1];
      }

      // Language detection (simple heuristic)
      const language = detectLanguage(text || title || '');

      reviews.push({
        ta_review_id: reviewId,
        ta_author: author,
        ta_author_location: authorLocation,
        rating,
        title,
        text,
        visited_date: visitedDate,
        published_date: publishedDate,
        language
      });
    } catch (error: any) {
      logger.debug({ placeId, error: error.message }, 'Failed to extract review');
    }
  });

  return reviews;
}

function detectLanguage(text: string): string | null {
  // Simple heuristic: check for common Chinese characters
  if (/[\u4e00-\u9fff]/.test(text)) {
    return 'zh';
  }
  // Could add more language detection here
  return 'en'; // Default to English
}

function saveRawHtml(placeId: string, filename: string, html: string): void {
  try {
    const rawDir = join(process.cwd(), 'data', 'raw', placeId);
    mkdirSync(rawDir, { recursive: true });
    const filePath = join(rawDir, filename);
    writeFileSync(filePath, html, 'utf-8');
    logger.debug({ placeId, filePath }, 'Saved raw HTML for debugging');
  } catch (error: any) {
    logger.error({ placeId, error: error.message }, 'Failed to save raw HTML');
  }
}
