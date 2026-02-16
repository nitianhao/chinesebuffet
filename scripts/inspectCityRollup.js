const { init } = require('@instantdb/admin');
require('dotenv').config({ path: '.env.local' });

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
    console.error('❌ INSTANT_ADMIN_TOKEN is required. Set it in .env.local');
    process.exit(1);
}

const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN });

const citySlug = process.argv[2];
if (!citySlug) {
    console.error("Please provide a city slug, e.g. 'pekin-il'");
    process.exit(1);
}

async function inspectCityRollup() {
    console.log(`🔍 Inspecting rollup for: ${citySlug}`);

    try {
        const result = await db.query({
            directoryRollups: {
                $: {
                    where: {
                        type: 'cityBuffets',
                        key: citySlug
                    },
                    limit: 1
                }
            }
        });

        const rollups = result.directoryRollups || [];
        if (rollups.length === 0) {
            console.log('❌ Rollup not found.');
            return;
        }

        const rollupString = rollups[0].data;
        if (!rollupString) {
            console.log('❌ Rollup data is empty.');
            return;
        }

        const data = JSON.parse(rollupString);

        console.log(`✅ Rollup found. Updated at: ${rollups[0].updatedAt}`);

        // Check City POI Summary
        if (data.cityPoiSummary) {
            console.log('✅ hasCityPoiSummary: true');
            if (data.cityPoiSummary.topCategories) {
                console.log('   Top categories:', data.cityPoiSummary.topCategories.slice(0, 2));
            } else {
                console.log('   (topCategories missing or empty)');
            }
        } else {
            console.log('❌ hasCityPoiSummary: false');
        }

        // Check Buffet POI Summary
        if (data.buffets && data.buffets.length > 0) {
            const firstBuffet = data.buffets[0];
            if (firstBuffet.poiSummary) {
                console.log('✅ hasBuffetPoiSummary (on first buffet): true');
                console.log('   First buffet summary:', JSON.stringify(firstBuffet.poiSummary, null, 2));
            } else {
                console.log('❌ hasBuffetPoiSummary (on first buffet): false');
            }
        } else {
            console.log('⚠️ No buffets in this city.');
        }

    } catch (error) {
        console.error("Error inspecting rollup:", error);
    }
}

inspectCityRollup();
