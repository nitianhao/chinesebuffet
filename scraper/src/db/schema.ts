import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';

export interface Place {
  place_id: string;
  google_name: string | null;
  google_address: string | null;
  google_lat: number | null;
  google_lng: number | null;
  ta_url: string | null;
  ta_location_id: string | null;
  status: 'pending' | 'mapped' | 'scraping' | 'done' | 'retry' | 'blocked' | 'error';
  attempts: number;
  last_error: string | null;
  last_success_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id?: number;
  place_id: string;
  ta_review_id: string | null;
  ta_author: string | null;
  ta_author_location: string | null;
  rating: number | null;
  title: string | null;
  text: string | null;
  visited_date: string | null;
  published_date: string | null;
  language: string | null;
  created_at: string;
}

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure data directory exists
    const dataDir = join(process.cwd(), 'data');
    mkdirSync(dataDir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    this.migrate();
  }

  private migrate() {
    // Create places table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS places (
        place_id TEXT PRIMARY KEY,
        google_name TEXT,
        google_address TEXT,
        google_lat REAL,
        google_lng REAL,
        ta_url TEXT,
        ta_location_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        last_success_at TEXT,
        next_run_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create ta_reviews table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ta_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        place_id TEXT NOT NULL,
        ta_review_id TEXT,
        ta_author TEXT,
        ta_author_location TEXT,
        rating REAL,
        title TEXT,
        text TEXT,
        visited_date TEXT,
        published_date TEXT,
        language TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (place_id) REFERENCES places(place_id)
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_places_status ON places(status);
      CREATE INDEX IF NOT EXISTS idx_places_next_run_at ON places(next_run_at);
      CREATE INDEX IF NOT EXISTS idx_reviews_place_id ON ta_reviews(place_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_ta_review_id ON ta_reviews(ta_review_id);
    `);
  }

  // Place operations
  insertPlace(place: Omit<Place, 'created_at' | 'updated_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO places (
        place_id, google_name, google_address, google_lat, google_lng,
        ta_url, ta_location_id, status, attempts, last_error,
        last_success_at, next_run_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(place_id) DO UPDATE SET
        google_name = excluded.google_name,
        google_address = excluded.google_address,
        google_lat = excluded.google_lat,
        google_lng = excluded.google_lng,
        ta_url = excluded.ta_url,
        ta_location_id = excluded.ta_location_id,
        status = excluded.status,
        attempts = excluded.attempts,
        last_error = excluded.last_error,
        last_success_at = excluded.last_success_at,
        next_run_at = excluded.next_run_at,
        updated_at = datetime('now')
    `);

    stmt.run(
      place.place_id,
      place.google_name,
      place.google_address,
      place.google_lat,
      place.google_lng,
      place.ta_url,
      place.ta_location_id,
      place.status,
      place.attempts,
      place.last_error,
      place.last_success_at,
      place.next_run_at
    );
  }

  getPlace(placeId: string): Place | null {
    const stmt = this.db.prepare('SELECT * FROM places WHERE place_id = ?');
    return stmt.get(placeId) as Place | null;
  }

  updatePlaceStatus(
    placeId: string,
    status: Place['status'],
    error?: string | null,
    taUrl?: string | null,
    taLocationId?: string | null
  ): void {
    const stmt = this.db.prepare(`
      UPDATE places
      SET status = ?,
          last_error = ?,
          ta_url = COALESCE(?, ta_url),
          ta_location_id = COALESCE(?, ta_location_id),
          attempts = attempts + 1,
          updated_at = datetime('now')
      WHERE place_id = ?
    `);
    stmt.run(status, error || null, taUrl || null, taLocationId || null, placeId);
  }

  markPlaceSuccess(placeId: string): void {
    const stmt = this.db.prepare(`
      UPDATE places
      SET status = 'done',
          last_success_at = datetime('now'),
          updated_at = datetime('now')
      WHERE place_id = ?
    `);
    stmt.run(placeId);
  }

  getPendingPlaces(limit: number = 10): Place[] {
    const stmt = this.db.prepare(`
      SELECT * FROM places
      WHERE status IN ('pending', 'retry')
        AND (next_run_at IS NULL OR next_run_at <= datetime('now'))
      ORDER BY created_at ASC
      LIMIT ?
    `);
    return stmt.all(limit) as Place[];
  }

  // Review operations
  insertReview(review: Omit<Review, 'id' | 'created_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO ta_reviews (
        place_id, ta_review_id, ta_author, ta_author_location,
        rating, title, text, visited_date, published_date, language, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    stmt.run(
      review.place_id,
      review.ta_review_id,
      review.ta_author,
      review.ta_author_location,
      review.rating,
      review.title,
      review.text,
      review.visited_date,
      review.published_date,
      review.language
    );
  }

  insertReviews(reviews: Omit<Review, 'id' | 'created_at'>[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO ta_reviews (
        place_id, ta_review_id, ta_author, ta_author_location,
        rating, title, text, visited_date, published_date, language, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const insertMany = this.db.transaction((reviews) => {
      for (const review of reviews) {
        stmt.run(
          review.place_id,
          review.ta_review_id,
          review.ta_author,
          review.ta_author_location,
          review.rating,
          review.title,
          review.text,
          review.visited_date,
          review.published_date,
          review.language
        );
      }
    });

    insertMany(reviews);
  }

  getReviewCount(placeId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM ta_reviews WHERE place_id = ?');
    const result = stmt.get(placeId) as { count: number };
    return result.count;
  }

  hasReview(placeId: string, taReviewId: string | null): boolean {
    if (!taReviewId) return false;
    const stmt = this.db.prepare('SELECT 1 FROM ta_reviews WHERE place_id = ? AND ta_review_id = ? LIMIT 1');
    return stmt.get(placeId, taReviewId) !== undefined;
  }

  updateNextRunAt(placeId: string, nextRunAt: Date): void {
    const stmt = this.db.prepare(`
      UPDATE places
      SET next_run_at = datetime(?, 'unixepoch'),
          updated_at = datetime('now')
      WHERE place_id = ?
    `);
    stmt.run(Math.floor(nextRunAt.getTime() / 1000), placeId);
  }

  getAllReviews(): Review[] {
    const stmt = this.db.prepare('SELECT * FROM ta_reviews ORDER BY created_at DESC');
    return stmt.all() as Review[];
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
