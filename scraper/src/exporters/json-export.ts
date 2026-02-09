import { mkdirSync, createWriteStream } from 'fs';
import { join } from 'path';
import { DatabaseManager, Review } from '../db/schema.js';
import { logger } from '../utils/logger.js';

export async function exportReviewsToNDJSON(
  db: DatabaseManager,
  outputPath: string = './data/exports/reviews.ndjson'
): Promise<void> {
  try {
    // Ensure export directory exists
    const exportDir = join(process.cwd(), 'data', 'exports');
    mkdirSync(exportDir, { recursive: true });

    const fullPath = join(process.cwd(), outputPath);
    const stream = createWriteStream(fullPath, { flags: 'w' });

    // Get all reviews
    const reviews = db.getAllReviews();

    let count = 0;
    for (const review of reviews) {
      stream.write(JSON.stringify(review) + '\n');
      count++;
    }

    stream.end();

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    logger.info({ count, path: fullPath }, 'Exported reviews to NDJSON');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to export reviews');
    throw error;
  }
}
