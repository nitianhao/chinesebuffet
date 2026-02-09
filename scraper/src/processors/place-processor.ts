import { DatabaseManager } from '../db/schema.js';
import { fetchGooglePlaceDetails } from '../mappers/google-places.js';
import { findTripAdvisorListing } from '../mappers/tripadvisor.js';
import { scrapeTripAdvisorReviews } from '../scrapers/tripadvisor-reviews.js';
import { logger } from '../utils/logger.js';
import { randomDelay, exponentialBackoff } from '../utils/delay.js';

export interface ProcessorConfig {
  googleApiKey: string;
  maxReviewPages: number;
  minDelayMs: number;
  maxDelayMs: number;
}

export class PlaceProcessor {
  constructor(
    private db: DatabaseManager,
    private config: ProcessorConfig
  ) {}

  async processPlace(placeId: string): Promise<void> {
    const place = this.db.getPlace(placeId);
    if (!place) {
      throw new Error(`Place ${placeId} not found in database`);
    }

    logger.info({ placeId, status: place.status }, 'Processing place');

    try {
      // Step 1: Fetch Google Place details if not already done
      if (!place.google_name || !place.google_address) {
        await this.fetchGoogleDetails(placeId);
        await randomDelay(this.config.minDelayMs, this.config.maxDelayMs);
      }

      // Step 2: Map to TripAdvisor if not already mapped
      if (place.status === 'pending' || !place.ta_url) {
        await this.mapToTripAdvisor(placeId);
        await randomDelay(this.config.minDelayMs, this.config.maxDelayMs);
      }

      // Step 3: Scrape reviews if mapped
      const updatedPlace = this.db.getPlace(placeId);
      if (updatedPlace?.ta_url && updatedPlace.status !== 'done') {
        await this.scrapeReviews(placeId);
      }

      // Mark as done
      this.db.markPlaceSuccess(placeId);
      logger.info({ placeId }, 'Place processing completed');
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      logger.error({ placeId, error: errorMessage }, 'Place processing failed');

      // Determine status based on error
      let status: 'retry' | 'blocked' | 'error' = 'retry';
      if (errorMessage.includes('Blocked') || errorMessage.includes('blocked')) {
        status = 'blocked';
      } else if (place.attempts >= 5) {
        status = 'error';
      }

      // Calculate next run time (exponential backoff)
      const nextRunAt = new Date();
      const backoffMs = exponentialBackoff(place.attempts, 60000, 86400000); // 1 min to 24 hours
      nextRunAt.setTime(nextRunAt.getTime() + backoffMs);

      this.db.updatePlaceStatus(placeId, status, errorMessage);
      
      // Update next_run_at
      this.db.updateNextRunAt(placeId, nextRunAt);

      throw error;
    }
  }

  private async fetchGoogleDetails(placeId: string): Promise<void> {
    logger.debug({ placeId }, 'Fetching Google Place details');
    
    try {
      const details = await fetchGooglePlaceDetails(placeId, this.config.googleApiKey);
      
      if (!details) {
        throw new Error('Place not found in Google Places API');
      }

      this.db.insertPlace({
        place_id: placeId,
        google_name: details.name || null,
        google_address: details.formatted_address || null,
        google_lat: details.geometry?.location?.lat || null,
        google_lng: details.geometry?.location?.lng || null,
        ta_url: null,
        ta_location_id: null,
        status: 'pending',
        attempts: 0,
        last_error: null,
        last_success_at: null,
        next_run_at: null
      });

      logger.info({ placeId, name: details.name }, 'Google Place details fetched');
    } catch (error: any) {
      logger.error({ placeId, error: error.message }, 'Failed to fetch Google Place details');
      throw error;
    }
  }

  private async mapToTripAdvisor(placeId: string): Promise<void> {
    logger.debug({ placeId }, 'Mapping to TripAdvisor');
    
    const place = this.db.getPlace(placeId);
    if (!place?.google_name) {
      throw new Error('Google Place details not available');
    }

    try {
      const mapping = await findTripAdvisorListing(
        place.google_name,
        place.google_address,
        place.google_lat,
        place.google_lng
      );

      if (mapping.url) {
        this.db.updatePlaceStatus(placeId, 'mapped', null, mapping.url, mapping.locationId);
        logger.info({ placeId, taUrl: mapping.url }, 'Mapped to TripAdvisor');
      } else {
        this.db.updatePlaceStatus(placeId, 'error', 'TripAdvisor listing not found');
        throw new Error('TripAdvisor listing not found');
      }
    } catch (error: any) {
      logger.error({ placeId, error: error.message }, 'Failed to map to TripAdvisor');
      throw error;
    }
  }

  private async scrapeReviews(placeId: string): Promise<void> {
    logger.debug({ placeId }, 'Scraping TripAdvisor reviews');
    
    const place = this.db.getPlace(placeId);
    if (!place?.ta_url) {
      throw new Error('TripAdvisor URL not available');
    }

    try {
      this.db.updatePlaceStatus(placeId, 'scraping');

      const reviews = await scrapeTripAdvisorReviews(
        place.ta_url,
        placeId,
        this.config.maxReviewPages
      );

      if (reviews.length === 0) {
        logger.warn({ placeId }, 'No reviews extracted');
        return;
      }

      // Filter out duplicates and insert
      const existingCount = this.db.getReviewCount(placeId);
      const newReviews = reviews.filter(review => {
        if (!review.ta_review_id) return true; // Include reviews without ID
        return !this.db.hasReview(placeId, review.ta_review_id);
      });

      if (newReviews.length > 0) {
        this.db.insertReviews(newReviews.map(review => ({
          place_id: placeId,
          ...review
        })));

        logger.info({ placeId, newReviews: newReviews.length, totalReviews: existingCount + newReviews.length }, 'Reviews saved');
      } else {
        logger.info({ placeId }, 'All reviews already in database');
      }
    } catch (error: any) {
      logger.error({ placeId, error: error.message }, 'Failed to scrape reviews');
      throw error;
    }
  }
}
