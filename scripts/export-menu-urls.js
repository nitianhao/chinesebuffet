// Script to export menu URLs from database
// Run with: node scripts/export-menu-urls.js

const { init } = require('@instantdb/admin');
const schema = require('../src/instant.schema.ts');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

async function exportMenuUrls() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });

  console.log('Fetching all buffets...');
  
  // Fetch all buffets with a high limit
  const buffetsResult = await db.query({
    buffets: {
      $: {
        limit: 10000,
      }
    }
  });

  const buffets = buffetsResult.buffets || [];
  console.log(`Total buffets: ${buffets.length}`);

  // Fetch all menus
  console.log('Fetching all menus...');
  const menusResult = await db.query({
    menus: {
      $: {
        limit: 10000,
      }
    }
  });

  const menus = menusResult.menus || [];
  console.log(`Total menus: ${menus.length}`);

  // Sort menus by scrapedAt (most recent first)
  menus.sort((a, b) => {
    const aTime = a.scrapedAt ? new Date(a.scrapedAt).getTime() : 0;
    const bTime = b.scrapedAt ? new Date(b.scrapedAt).getTime() : 0;
    return bTime - aTime;
  });

  // Create a map of placeId -> menu (most recent menu per placeId)
  const menuMap = new Map();
  for (const menu of menus) {
    if (menu.placeId && !menuMap.has(menu.placeId)) {
      menuMap.set(menu.placeId, menu);
    }
  }

  console.log(`Unique menus by placeId: ${menuMap.size}`);

  // Build the output array
  const output = [];
  let countFromBuffetsTable = 0;
  let countFromMenusTable = 0;

  for (const buffet of buffets) {
    if (!buffet.placeId) {
      continue; // Skip buffets without placeId
    }

    // First, check the menu field in the buffets table
    let menuData = parseJsonField(buffet.menu);
    
    if (menuData) {
      countFromBuffetsTable++;
    } else {
      // If no menu in buffets table, check the menus table
      const menu = menuMap.get(buffet.placeId);
      if (menu) {
        menuData = parseJsonField(menu.structuredData) || {
          sourceUrl: menu.sourceUrl,
          contentType: menu.contentType,
          categories: parseJsonField(menu.categories),
          items: parseJsonField(menu.items),
          rawText: menu.rawText
        };
        if (menuData) {
          countFromMenusTable++;
          menuSource = 'menus_table';
        }
      }
    }

    output.push({
      title: buffet.name || '',
      placeID: buffet.placeId,
      menu: menuData
    });
  }

  console.log(`\nExporting ${output.length} records with placeId and menu data...`);

  // Write to file
  const outputPath = path.join(__dirname, '../Example JSON/menu_urls.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n✅ Successfully exported to: ${outputPath}`);
  console.log(`Total records: ${output.length}`);
  const recordsWithMenu = output.filter(r => r.menu !== null).length;
  console.log(`Records with menu data: ${recordsWithMenu}`);
  console.log(`  - From buffets table: ${countFromBuffetsTable}`);
  console.log(`  - From menus table: ${countFromMenusTable}`);
  console.log(`Records without menu data: ${output.filter(r => r.menu === null).length}`);
}

exportMenuUrls().catch(console.error);

