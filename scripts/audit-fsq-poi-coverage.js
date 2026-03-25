const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFromFile(path.join(process.cwd(), '.env.local'));

const FIELDS = [
  'foodDining',
  'recreationEntertainment',
  'retailShopping',
  'artsCulture',
  'educationLearning',
  'repairMaintenance',
  'transportationAutomotive',
  'travelTourismServices',
  'accommodationLodging',
  'agriculturalFarming',
  'communicationsTechnology',
  'petCareVeterinary',
  'financialServices',
  'governmentPublicServices',
  'healthcareMedicalServices',
  'homeImprovementGarden',
  'industrialManufacturing',
  'miscellaneousServices',
  'personalCareBeauty',
  'professionalBusinessServices',
  'religiousSpiritual',
  'socialCommunityServices',
  'sportsFitness',
  'utilitiesInfrastructure',
];

function isPopulated(value) {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  return !(trimmed === '' || trimmed === 'null' || trimmed === '{}' || trimmed === '[]');
}

async function main() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('ERROR: INSTANT_ADMIN_TOKEN is not set in .env.local');
    process.exit(1);
  }

  const db = init({
    appId:
      process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
      process.env.INSTANT_APP_ID ||
      '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  });

  const limit = 500;
  let offset = 0;
  let totalBuffets = 0;
  let fsqBuffets = 0;
  const populatedCounts = Object.fromEntries(FIELDS.map((f) => [f, 0]));

  while (true) {
    const result = await db.query({
      buffets: {
        $: {
          limit,
          offset,
        },
      },
    });

    const buffets = result.buffets || [];
    if (buffets.length === 0) break;
    totalBuffets += buffets.length;

    for (const buffet of buffets) {
      const placeId = typeof buffet.placeId === 'string' ? buffet.placeId.trim().toLowerCase() : '';
      if (!placeId.startsWith('fsq')) continue;

      fsqBuffets++;
      for (const field of FIELDS) {
        if (isPopulated(buffet[field])) {
          populatedCounts[field]++;
        }
      }
    }

    if (buffets.length < limit) break;
    offset += limit;
  }

  console.log('='.repeat(80));
  console.log('FSQ POI COVERAGE AUDIT');
  console.log('='.repeat(80));
  console.log(`Total buffets scanned: ${totalBuffets}`);
  console.log(`FSQ buffets: ${fsqBuffets}`);
  console.log('-'.repeat(80));
  console.log('field | populated | missing | coverage');
  console.log('-'.repeat(80));
  for (const field of FIELDS) {
    const populated = populatedCounts[field];
    const missing = Math.max(0, fsqBuffets - populated);
    const coverage = fsqBuffets > 0 ? ((populated / fsqBuffets) * 100).toFixed(2) : '0.00';
    console.log(`${field} | ${populated} | ${missing} | ${coverage}%`);
  }
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
