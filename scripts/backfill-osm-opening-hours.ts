/**
 * Backfill `hours` from `rawOpeningHours` for OSM-matched FSQ buffets.
 *
 * Usage:
 *   npx tsx scripts/backfill-osm-opening-hours.ts                # dry-run
 *   npx tsx scripts/backfill-osm-opening-hours.ts --commit       # write to DB
 *   npx tsx scripts/backfill-osm-opening-hours.ts --limit 5
 *   npx tsx scripts/backfill-osm-opening-hours.ts --ids id1,id2
 */

import { init } from '@instantdb/admin';
// @ts-ignore
import schema from '../src/instant.schema';
import dotenv from 'dotenv';
import path from 'path';
import { osmHoursToAppFormat } from '../lib/osm-opening-hours';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const db = init({
  appId:
    process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
    process.env.INSTANT_APP_ID ||
    '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
  schema,
});

function parseArgs(argv: string[]) {
  const opts = { commit: false, limit: 0, ids: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--commit') {
      opts.commit = true;
    } else if (argv[i] === '--limit' && argv[i + 1]) {
      opts.limit = parseInt(argv[++i], 10);
    } else if (argv[i] === '--ids' && argv[i + 1]) {
      opts.ids = argv[++i].split(',').map(s => s.trim());
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Mode: ${opts.commit ? 'COMMIT' : 'DRY RUN'}`);

  const { data } = await db.query({
    buffets: {
      $: {
        where:
          opts.ids.length > 0
            ? { id: { $in: opts.ids } }
            : { placeId: { $like: 'fsq:%' } },
        ...(opts.limit > 0 ? { limit: opts.limit } : {}),
      },
    },
  });

  const buffets = (data?.buffets ?? []) as Array<{
    id: string;
    name?: string;
    placeId?: string;
    rawOpeningHours?: string | null;
    hours?: string | null;
  }>;

  const candidates = buffets.filter(
    b =>
      b.rawOpeningHours &&
      (!b.hours || b.hours === 'null' || b.hours === '[]')
  );

  console.log(
    `Found ${buffets.length} FSQ buffets, ${candidates.length} need hours backfill`
  );

  let updated = 0;
  let skipped = 0;

  for (const buffet of candidates) {
    const parsed = osmHoursToAppFormat(buffet.rawOpeningHours);

    if (!parsed) {
      console.log(
        `  SKIP [no parse] ${buffet.name} — rawOpeningHours: "${buffet.rawOpeningHours}"`
      );
      skipped++;
      continue;
    }

    const hoursJson = JSON.stringify(parsed);
    console.log(
      `  ${opts.commit ? 'WRITE' : 'WOULD WRITE'} ${buffet.name}: ${parsed.length} days`
    );

    if (opts.commit) {
      await db.transact([db.tx.buffets[buffet.id].update({ hours: hoursJson })]);
    }
    updated++;
  }

  console.log(
    `\nDone. Updated: ${updated}, Skipped (unparseable): ${skipped}`
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
