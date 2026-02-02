import { readFileSync } from 'fs';
import { logger } from '../utils/logger.js';

function parseCSV(content: string): string[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  // Parse header
  const headers = lines[0].split(',').map(h => h.trim());
  const placeIdIndex = headers.findIndex(h => 
    h.toLowerCase() === 'place_id' || 
    h.toLowerCase() === 'placeid' || 
    h.toLowerCase() === 'id'
  );
  
  // Parse rows
  const placeIds: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    if (placeIdIndex >= 0 && values[placeIdIndex]) {
      placeIds.push(values[placeIdIndex]);
    } else if (values[0]) {
      placeIds.push(values[0]); // Fallback to first column
    }
  }
  
  return placeIds;
}

export async function loadPlaceIdsFromFile(filePath: string): Promise<string[]> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const ext = filePath.split('.').pop()?.toLowerCase();

    if (ext === 'json') {
      const data = JSON.parse(content);
      // Handle both array and object with array property
      if (Array.isArray(data)) {
        return data.map(item => typeof item === 'string' ? item : item.place_id || item.id);
      } else if (data.place_ids || data.placeIds) {
        return data.place_ids || data.placeIds;
      } else {
        throw new Error('Invalid JSON format: expected array or object with place_ids/placeIds');
      }
    } else if (ext === 'csv') {
      return parseCSV(content);
    } else if (ext === 'txt') {
      return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    } else {
      throw new Error(`Unsupported file format: ${ext}`);
    }
  } catch (error: any) {
    logger.error({ filePath, error: error.message }, 'Failed to load place IDs');
    throw error;
  }
}
