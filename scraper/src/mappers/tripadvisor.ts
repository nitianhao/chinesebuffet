import { fetchWithRetry } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { randomDelay } from '../utils/delay.js';
import * as cheerio from 'cheerio';

const TRIPADVISOR_SEARCH_BASE = 'https://www.tripadvisor.com/Search';

export interface TripAdvisorMapping {
  url: string | null;
  locationId: string | null;
}

/**
 * Search TripAdvisor for a restaurant by name and location
 */
export async function findTripAdvisorListing(
  name: string,
  address: string | null,
  lat: number | null,
  lng: number | null
): Promise<TripAdvisorMapping> {
  // Build search query
  const queryParts = [name];
  if (address) {
    // Extract city/state from address if available
    const cityMatch = address.match(/([^,]+),\s*([A-Z]{2})\s*\d/);
    if (cityMatch) {
      queryParts.push(cityMatch[1].trim());
    }
  }

  const searchQuery = queryParts.join(' ');
  const searchUrl = `${TRIPADVISOR_SEARCH_BASE}?q=${encodeURIComponent(searchQuery)}&ssrc=A`;

  try {
    // Add delay before search
    await randomDelay(2000, 4000);

    const { body } = await fetchWithRetry(searchUrl, {
      timeout: 30000,
      retries: 2
    });

    const $ = cheerio.load(body);

    // Try to find restaurant listing in search results
    // TripAdvisor search results typically have links like /Restaurant_Review-...
    const restaurantLinks = $('a[href*="/Restaurant_Review-"]')
      .map((_, el) => $(el).attr('href'))
      .get()
      .filter((href): href is string => !!href)
      .slice(0, 5); // Check top 5 results

    if (restaurantLinks.length === 0) {
      logger.debug({ name, searchQuery }, 'No TripAdvisor restaurant links found in search');
      return { url: null, locationId: null };
    }

    // Try each link to find the best match
    for (const link of restaurantLinks) {
      const fullUrl = link.startsWith('http') ? link : `https://www.tripadvisor.com${link}`;
      
      try {
        await randomDelay(1500, 3000);
        
        const { body: pageBody } = await fetchWithRetry(fullUrl, {
          timeout: 30000,
          retries: 1
        });

        const $page = cheerio.load(pageBody);
        
        // Extract location ID from URL (format: /Restaurant_Review-g{locationId}-d{id}-...)
        const locationIdMatch = fullUrl.match(/Restaurant_Review-g(\d+)-/);
        const locationId = locationIdMatch ? locationIdMatch[1] : null;

        // Verify this is the right place by checking name
        const pageName = $page('h1[data-test-target="top-info-header"]').text().trim() ||
                        $page('h1').first().text().trim();

        // Simple name matching (case-insensitive, partial match)
        const nameLower = name.toLowerCase();
        const pageNameLower = pageName.toLowerCase();
        
        if (pageNameLower.includes(nameLower) || nameLower.includes(pageNameLower.split(' ')[0])) {
          logger.info({ name, url: fullUrl, locationId }, 'Found TripAdvisor listing');
          return { url: fullUrl, locationId };
        }
      } catch (error: any) {
        logger.debug({ link, error: error.message }, 'Failed to verify TripAdvisor link');
        continue;
      }
    }

    // If no exact match, return the first result
    const firstLink = restaurantLinks[0];
    const fullUrl = firstLink.startsWith('http') ? firstLink : `https://www.tripadvisor.com${firstLink}`;
    const locationIdMatch = fullUrl.match(/Restaurant_Review-g(\d+)-/);
    const locationId = locationIdMatch ? locationIdMatch[1] : null;

    logger.info({ name, url: fullUrl, locationId }, 'Using first TripAdvisor search result');
    return { url: fullUrl, locationId };
  } catch (error: any) {
    logger.error({ name, error: error.message }, 'Failed to search TripAdvisor');
    throw error;
  }
}
