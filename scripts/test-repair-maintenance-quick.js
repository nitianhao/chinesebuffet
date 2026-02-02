#!/usr/bin/env node

/**
 * Quick test script for repair & maintenance POI generation
 * 
 * Usage:
 *   node scripts/test-repair-maintenance-quick.js
 *   node scripts/test-repair-maintenance-quick.js 5
 *   node scripts/test-repair-maintenance-quick.js --buffetId <id>
 */

const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const limit = args[0] && !args[0].startsWith('--') ? args[0] : '3';
const buffetIdIndex = args.findIndex(arg => arg === '--buffetId' || arg === '--buffet-id');

const scriptPath = path.join(__dirname, 'generate-poi-repair-maintenance.ts');

console.log('='.repeat(60));
console.log('Quick Test: Repair & Maintenance POI Generation');
console.log('='.repeat(60));
console.log('');

let commandArgs = ['--dry-run', '--concurrency', '1'];

if (buffetIdIndex >= 0 && args[buffetIdIndex + 1]) {
  const buffetId = args[buffetIdIndex + 1];
  console.log(`Testing single buffet: ${buffetId}\n`);
  commandArgs.push('--buffetId', buffetId);
} else {
  console.log(`Testing with limit: ${limit}\n`);
  commandArgs.push('--limit', limit);
}

console.log(`Running: npx tsx ${scriptPath} ${commandArgs.join(' ')}\n`);
console.log('-'.repeat(60));
console.log('');

const child = spawn('npx', ['tsx', scriptPath, ...commandArgs], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd()
});

child.on('close', (code) => {
  console.log('');
  console.log('-'.repeat(60));
  if (code === 0) {
    console.log('✓ Test completed successfully');
  } else {
    console.log(`✗ Test failed with exit code ${code}`);
    process.exit(code);
  }
});

child.on('error', (error) => {
  console.error('Failed to start test:', error);
  process.exit(1);
});
