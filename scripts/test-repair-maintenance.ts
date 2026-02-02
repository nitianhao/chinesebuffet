/**
 * Test script for repair & maintenance POI generation
 * 
 * Usage:
 *   npx tsx scripts/test-repair-maintenance.ts
 *   npx tsx scripts/test-repair-maintenance.ts --buffetId <id>
 *   npx tsx scripts/test-repair-maintenance.ts --limit 5
 */

import { spawn } from 'child_process';
import * as path from 'path';

const scriptPath = path.join(__dirname, 'generate-poi-repair-maintenance.ts');

function runTest(args: string[] = []) {
  return new Promise<void>((resolve, reject) => {
    const defaultArgs = [
      '--dry-run',
      '--concurrency', '1', // Single concurrency for testing
      ...args
    ];

    console.log('='.repeat(80));
    console.log('Testing Repair & Maintenance POI Generation');
    console.log('='.repeat(80));
    console.log(`Command: npx tsx ${scriptPath} ${defaultArgs.join(' ')}`);
    console.log('='.repeat(80));
    console.log('');

    const child = spawn('npx', ['tsx', scriptPath, ...defaultArgs], {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('\n' + '='.repeat(80));
        console.log('Test completed successfully');
        console.log('='.repeat(80));
        resolve();
      } else {
        console.error('\n' + '='.repeat(80));
        console.error(`Test failed with exit code ${code}`);
        console.error('='.repeat(80));
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      console.error('Failed to start test:', error);
      reject(error);
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  
  // Check for specific test modes
  const buffetId = argv.find(arg => arg.startsWith('--buffetId='))?.split('=')[1] ||
                   (argv.includes('--buffetId') && argv[argv.indexOf('--buffetId') + 1]);
  
  const limit = argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ||
                (argv.includes('--limit') && argv[argv.indexOf('--limit') + 1]);

  try {
    if (buffetId) {
      console.log(`Testing single buffet: ${buffetId}\n`);
      await runTest(['--buffetId', buffetId]);
    } else if (limit) {
      console.log(`Testing with limit: ${limit}\n`);
      await runTest(['--limit', limit]);
    } else {
      console.log('Testing with default limit: 3\n');
      await runTest(['--limit', '3']);
    }
  } catch (error: any) {
    console.error('Test error:', error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
