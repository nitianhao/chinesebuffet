/**
 * Generate FAQs for first 100 buffets and write to database
 * 
 * This is a convenience script that runs the main FAQ generator
 * with --limit 100 and --write flags enabled.
 * 
 * Usage:
 *   npx tsx scripts/generate-faqs-100.ts
 */

import { exec } from 'child_process';
import path from 'path';

const scriptPath = path.join(__dirname, 'generate-faqs-from-reviews.ts');

console.log('🚀 Generating FAQs for first 100 buffets and writing to database...\n');

// Use exec instead of spawn to properly handle paths with spaces
const command = `npx tsx "${scriptPath}" --limit 100 --write`;

exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  
  if (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  } else {
    console.log('\n✅ Done!');
  }
});
