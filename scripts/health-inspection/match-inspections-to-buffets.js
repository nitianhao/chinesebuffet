/**
 * Restaurant Matching Algorithm
 * 
 * Matches health inspection records to buffet profiles using:
 * - Fuzzy name matching (Levenshtein distance)
 * - Address matching
 * - Phone number validation
 * 
 * Usage:
 *   node scripts/health-inspection/match-inspections-to-buffets.js [state]
 */

const fs = require('fs');
const path = require('path');

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Distance (0 = identical, higher = more different)
 */
function levenshteinDistance(str1, str2) {
  if (!str1 || !str2) return Math.max(str1?.length || 0, str2?.length || 0);
  
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];
  
  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Normalize string for comparison (lowercase, remove special chars, trim)
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
function normalizeString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * Extract key words from restaurant name (remove common words)
 * @param {string} name - Restaurant name
 * @returns {string} Key words only
 */
function extractKeyWords(name) {
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'restaurant', 'restaurants', 'buffet', 'buffets',
    'chinese', 'chinese', 'food', 'dining', 'eatery', 'cafe', 'café'
  ]);
  
  const words = normalizeString(name).split(' ').filter(word => 
    word.length > 2 && !commonWords.has(word)
  );
  
  return words.join(' ');
}

/**
 * Calculate name similarity score (0-1, higher = more similar)
 * @param {string} name1 - First name
 * @param {string} name2 - Second name
 * @returns {number} Similarity score
 */
function calculateNameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0;
  
  const norm1 = normalizeString(name1);
  const norm2 = normalizeString(name2);
  
  // Exact match
  if (norm1 === norm2) return 1.0;
  
  // Check if one contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const shorter = Math.min(norm1.length, norm2.length);
    const longer = Math.max(norm1.length, norm2.length);
    return shorter / longer;
  }
  
  // Use key words
  const keyWords1 = extractKeyWords(name1);
  const keyWords2 = extractKeyWords(name2);
  
  if (keyWords1 && keyWords2) {
    if (keyWords1 === keyWords2) return 0.95;
    if (keyWords1.includes(keyWords2) || keyWords2.includes(keyWords1)) {
      return 0.85;
    }
  }
  
  // Levenshtein distance
  const distance = levenshteinDistance(norm1, norm2);
  const maxLen = Math.max(norm1.length, norm2.length);
  const similarity = 1 - (distance / maxLen);
  
  return Math.max(0, similarity);
}

/**
 * Normalize address for comparison
 * @param {string} address - Address string
 * @returns {string} Normalized address
 */
function normalizeAddress(address) {
  if (!address) return '';
  
  return address
    .toLowerCase()
    .replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|wy)\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate address similarity
 * @param {string} addr1 - First address
 * @param {string} addr2 - Second address
 * @returns {number} Similarity score (0-1)
 */
function calculateAddressSimilarity(addr1, addr2) {
  if (!addr1 || !addr2) return 0;
  
  const norm1 = normalizeAddress(addr1);
  const norm2 = normalizeAddress(addr2);
  
  if (norm1 === norm2) return 1.0;
  
  // Check if addresses share significant parts
  const words1 = norm1.split(' ').filter(w => w.length > 2);
  const words2 = norm2.split(' ').filter(w => w.length > 2);
  
  const commonWords = words1.filter(w => words2.includes(w));
  if (commonWords.length >= 2) {
    return 0.7;
  }
  
  // Levenshtein distance
  const distance = levenshteinDistance(norm1, norm2);
  const maxLen = Math.max(norm1.length, norm2.length);
  return Math.max(0, 1 - (distance / maxLen));
}

/**
 * Normalize phone number (remove formatting)
 * @param {string} phone - Phone number
 * @returns {string} Normalized phone (digits only)
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Check if phone numbers match
 * @param {string} phone1 - First phone
 * @param {string} phone2 - Second phone
 * @returns {boolean} True if phones match
 */
function phonesMatch(phone1, phone2) {
  if (!phone1 || !phone2) return false;
  
  const norm1 = normalizePhone(phone1);
  const norm2 = normalizePhone(phone2);
  
  if (norm1.length < 10 || norm2.length < 10) return false;
  
  // Compare last 10 digits (handles country codes)
  const last10_1 = norm1.slice(-10);
  const last10_2 = norm2.slice(-10);
  
  return last10_1 === last10_2;
}

/**
 * Calculate overall match score
 * @param {Object} buffet - Buffet profile
 * @param {Object} inspection - Health inspection record
 * @returns {Object} Match result with score and details
 */
function calculateMatchScore(buffet, inspection) {
  const scores = {
    name: 0,
    address: 0,
    phone: 0,
  };
  
  // Name matching
  const buffetName = buffet.name || '';
  const inspectionName = inspection.restaurant?.name || inspection._raw?.dba || '';
  scores.name = calculateNameSimilarity(buffetName, inspectionName);
  
  // Address matching
  const buffetAddr = buffet.address?.full || buffet.address?.street || '';
  const inspectionAddr = inspection.restaurant?.address || 
                        `${inspection._raw?.building || ''} ${inspection._raw?.street || ''}`.trim();
  scores.address = calculateAddressSimilarity(buffetAddr, inspectionAddr);
  
  // Phone matching
  const buffetPhone = buffet.phone || buffet.phoneUnformatted || '';
  const inspectionPhone = inspection.restaurant?.phone || inspection._raw?.phone || '';
  scores.phone = phonesMatch(buffetPhone, inspectionPhone) ? 1.0 : 0;
  
  // Weighted overall score
  const overallScore = (
    scores.name * 0.5 +      // Name is most important
    scores.address * 0.4 +   // Address is second most important
    scores.phone * 0.1       // Phone is bonus
  );
  
  return {
    score: overallScore,
    details: scores,
    confidence: overallScore >= 0.8 ? 'high' : overallScore >= 0.6 ? 'medium' : 'low',
  };
}

/**
 * Match health inspections to buffets
 * @param {Array} buffets - Array of buffet profiles
 * @param {Object} healthInspections - Object mapping IDs to health inspection data
 * @param {Object} options - Matching options
 * @returns {Array} Array of matches with scores
 */
function matchInspectionsToBuffets(buffets, healthInspections, options = {}) {
  const { minScore = 0.6, maxMatches = 1 } = options;
  const matches = [];
  
  Object.entries(healthInspections).forEach(([inspectionId, inspection]) => {
    const buffetMatches = [];
    
    buffets.forEach((buffet) => {
      const matchResult = calculateMatchScore(buffet, inspection);
      
      if (matchResult.score >= minScore) {
        buffetMatches.push({
          buffetId: buffet.id,
          buffetName: buffet.name,
          inspectionId: inspectionId,
          inspectionName: inspection.restaurant?.name || inspection._raw?.dba,
          score: matchResult.score,
          confidence: matchResult.confidence,
          details: matchResult.details,
        });
      }
    });
    
    // Sort by score (highest first) and take top matches
    buffetMatches.sort((a, b) => b.score - a.score);
    const topMatches = buffetMatches.slice(0, maxMatches);
    
    topMatches.forEach(match => {
      matches.push({
        ...match,
        healthInspection: inspection.healthInspection,
      });
    });
  });
  
  // Sort all matches by score
  matches.sort((a, b) => b.score - a.score);
  
  return matches;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const state = args[0] || 'NY';
  
  try {
    // Load buffets
    const buffetsPath = path.join(__dirname, '../..', 'data', 'buffets-by-id.json');
    if (!fs.existsSync(buffetsPath)) {
      console.error('Buffets file not found:', buffetsPath);
      process.exit(1);
    }
    
    const buffetsById = JSON.parse(fs.readFileSync(buffetsPath, 'utf8'));
    const buffets = Object.values(buffetsById);
    
    // Filter by state if specified
    const filteredBuffets = state !== 'ALL' 
      ? buffets.filter(b => b.address?.stateAbbr === state || b.address?.state === state)
      : buffets;
    
    console.log(`Loaded ${filteredBuffets.length} buffets${state !== 'ALL' ? ` from ${state}` : ''}`);
    
    // Load health inspections
    const inspectionsPath = path.join(__dirname, '../..', 'data', 'health-inspections', `${state.toLowerCase()}-inspections.json`);
    if (!fs.existsSync(inspectionsPath)) {
      console.error('Health inspections file not found:', inspectionsPath);
      console.log('Run fetch script first to download inspection data.');
      process.exit(1);
    }
    
    const healthInspections = JSON.parse(fs.readFileSync(inspectionsPath, 'utf8'));
    console.log(`Loaded ${Object.keys(healthInspections).length} health inspection records`);
    
    // Perform matching
    console.log('\nMatching inspections to buffets...');
    const matches = matchInspectionsToBuffets(filteredBuffets, healthInspections, {
      minScore: 0.6,
      maxMatches: 1,
    });
    
    console.log(`Found ${matches.length} matches`);
    
    // Group by confidence
    const byConfidence = {
      high: matches.filter(m => m.confidence === 'high'),
      medium: matches.filter(m => m.confidence === 'medium'),
      low: matches.filter(m => m.confidence === 'low'),
    };
    
    console.log(`  High confidence: ${byConfidence.high.length}`);
    console.log(`  Medium confidence: ${byConfidence.medium.length}`);
    console.log(`  Low confidence: ${byConfidence.low.length}`);
    
    // Save matches
    const outputDir = path.join(__dirname, '../..', 'data', 'health-inspections');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFile = path.join(outputDir, `matches-${state.toLowerCase()}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(matches, null, 2));
    console.log(`\n✓ Saved matches to ${outputFile}`);
    
    // Print sample matches
    if (matches.length > 0) {
      console.log('\nSample matches:');
      matches.slice(0, 5).forEach((match, idx) => {
        console.log(`\n${idx + 1}. ${match.buffetName} <-> ${match.inspectionName}`);
        console.log(`   Score: ${(match.score * 100).toFixed(1)}% (${match.confidence} confidence)`);
        console.log(`   Name: ${(match.details.name * 100).toFixed(1)}%, Address: ${(match.details.address * 100).toFixed(1)}%, Phone: ${(match.details.phone * 100).toFixed(1)}%`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  calculateNameSimilarity,
  calculateAddressSimilarity,
  phonesMatch,
  calculateMatchScore,
  matchInspectionsToBuffets,
};
















