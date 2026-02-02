#!/usr/bin/env node

/**
 * Main script that runs all performance budget checks
 * This is called after the build completes
 */

const { spawn } = require('child_process');
const path = require('path');

const scriptsDir = path.join(__dirname);
const bundleCheck = path.join(scriptsDir, 'check-bundle-budgets.js');
const lighthouseCheck = path.join(scriptsDir, 'check-lighthouse-budgets.js');

async function runCheck(scriptPath, scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔍 Running ${scriptName}...`);
    const check = spawn('node', [scriptPath], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });

    check.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptName} failed with code ${code}`));
      }
    });

    check.on('error', (error) => {
      reject(new Error(`${scriptName} error: ${error.message}`));
    });
  });
}

async function main() {
  try {
    // Check bundle sizes first (faster)
    await runCheck(bundleCheck, 'Bundle Size Check');
    
    // Then check Lighthouse metrics (slower, requires server)
    await runCheck(lighthouseCheck, 'Lighthouse Check');
    
    console.log('\n✅ All performance budgets passed!');
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Performance budget check failed: ${error.message}`);
    process.exit(1);
  }
}

main();
