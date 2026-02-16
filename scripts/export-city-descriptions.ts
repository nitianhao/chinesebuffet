
import { init } from '@instantdb/admin';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
    console.error('INSTANT_ADMIN_TOKEN is missing in .env.local');
    process.exit(1);
}

// Helper to safely parse JSON fields that are stored as strings
function safeParseJson(value: any): any {
    if (!value || typeof value !== 'string') return value || [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch (e) {
        return [value];
    }
}

async function exportEnrichedCityDescriptions() {
    console.log('Connecting to InstantDB...');
    const db = init({
        appId: APP_ID,
        adminToken: ADMIN_TOKEN,
    });

    try {
        console.log('Fetching enriched cities and their buffets...');
        const result = await db.query({
            cities: {
                $: {
                    fields: [
                        'city', 'state', 'stateAbbr', 'population', 'slug',
                        'majorHotels', 'nearbyCities', 'notableFacts',
                        'restaurantDensity', 'shoppingCenters', 'topAttractions', 'universities'
                    ]
                },
                buffets: {
                    $: { fields: ['id'] } // Only fetch id to count them
                }
            }
        });

        const cities = result.cities || [];
        console.log(`Fetched ${cities.length} cities.`);

        const formattedData = cities.map(city => ({
            city: city.city,
            state: city.state,
            stateAbbr: city.stateAbbr,
            population: city.population,
            restaurantDensity: city.restaurantDensity || null,
            majorHotels: safeParseJson(city.majorHotels),
            nearbyCities: safeParseJson(city.nearbyCities),
            notableFacts: safeParseJson(city.notableFacts),
            shoppingCenters: safeParseJson(city.shoppingCenters),
            topAttractions: safeParseJson(city.topAttractions),
            universities: safeParseJson(city.universities),
            buffetCount: (city.buffets || []).length
        }));

        const outputFolder = path.join(process.cwd(), 'cityDescriptions');

        // Chunking logic: 200 cities per file
        const chunkSize = 200;
        const totalChapters = Math.ceil(formattedData.length / chunkSize);

        console.log(`Splitting ${formattedData.length} cities into ${totalChapters} files...`);

        for (let i = 0; i < formattedData.length; i += chunkSize) {
            const chunk = formattedData.slice(i, i + chunkSize);
            const chapterIndex = Math.floor(i / chunkSize) + 1;
            const fileName = `cities_${chapterIndex}.json`;
            const filePath = path.join(outputFolder, fileName);

            fs.writeFileSync(filePath, JSON.stringify(chunk, null, 2));
            console.log(`✓ Saved ${chunk.length} cities to ${fileName}`);
        }

        console.log(`\n✓ Successfully exported and split data into ${totalChapters} files in ${outputFolder}`);

    } catch (error) {
        console.error('Error during enriched export:', error);
        process.exit(1);
    }
}

exportEnrichedCityDescriptions();
