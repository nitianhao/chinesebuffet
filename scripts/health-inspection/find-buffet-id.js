const { init } = require('@instantdb/admin');
const schema = require('../../src/instant.schema.ts');

const db = init({
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function findBuffet() {
  try {
    // Get all buffets and filter in JavaScript
    const result = await db.query({ buffets: {} });
    
    if (result.buffets && result.buffets.length > 0) {
      // Try to find Kings Buffet
      let buffet = result.buffets.find(b => 
        b.name && b.name.toLowerCase().includes('kings')
      );
      
      // If not found, use first buffet
      if (!buffet) {
        buffet = result.buffets[0];
      }
      
      console.log('Found buffet:');
      console.log(JSON.stringify({
        id: buffet.id,
        name: buffet.name,
        slug: buffet.slug,
        cityName: buffet.cityName,
        state: buffet.state
      }, null, 2));
      return buffet.id;
    }
    
    throw new Error('No buffets found in database');
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

if (require.main === module) {
  findBuffet();
}

module.exports = { findBuffet };

