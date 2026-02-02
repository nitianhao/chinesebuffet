#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const budgetsPath = path.join(__dirname, '..', 'performance-budgets.json');
const budgets = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));

const buildDir = path.join(__dirname, '..', '.next');

if (!fs.existsSync(buildDir)) {
  console.error('❌ Build directory not found. Run "next build" first.');
  process.exit(1);
}

// Check if lighthouse is available
const lighthouseAvailable = new Promise((resolve) => {
  const check = spawn('npx', ['lighthouse', '--version'], { stdio: 'pipe' });
  check.on('close', (code) => resolve(code === 0));
  check.on('error', () => resolve(false));
});

async function runLighthouseCheck() {
  const isAvailable = await lighthouseAvailable;
  
  if (!isAvailable) {
    console.log('⚠️  Lighthouse not found. Installing...');
    const install = spawn('npm', ['install', '--save-dev', 'lighthouse'], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    
    await new Promise((resolve, reject) => {
      install.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('Failed to install lighthouse'));
      });
    });
  }

  // Start Next.js server in background
  console.log('🚀 Starting Next.js server for Lighthouse audit...');
  const server = spawn('npm', ['start'], {
    stdio: 'pipe',
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3000' },
  });

  // Wait for server to be ready
  let serverReady = false;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!serverReady) {
        console.error('❌ Server failed to start within 30 seconds');
        server.kill();
        reject(new Error('Server startup timeout'));
      }
    }, 30000);

    const checkReady = () => {
      // Try to connect to the server
      const http = require('http');
      const req = http.get('http://localhost:3000', (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) {
          // Server is responding
          serverReady = true;
          clearTimeout(timeout);
          setTimeout(resolve, 2000); // Give it 2 more seconds to be fully ready
        } else {
          setTimeout(checkReady, 1000);
        }
      });
      req.on('error', () => {
        setTimeout(checkReady, 1000);
      });
      req.setTimeout(5000, () => {
        req.destroy();
        setTimeout(checkReady, 1000);
      });
    };

    // Start checking after a short delay
    setTimeout(checkReady, 2000);

    server.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Ready') || output.includes('started server') || output.includes('Local:')) {
        setTimeout(checkReady, 1000);
      }
    });

    server.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('EADDRINUSE')) {
        clearTimeout(timeout);
        reject(new Error('Port 3000 is already in use'));
      }
    });
  });

  try {
    // Run Lighthouse
    console.log('🔍 Running Lighthouse audit...');
    const lighthouse = spawn('npx', [
      'lighthouse',
      'http://localhost:3000',
      '--only-categories=performance',
      '--output=json',
      '--output-path=./lighthouse-report.json',
      '--chrome-flags=--headless --no-sandbox',
      '--quiet',
    ], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });

    await new Promise((resolve, reject) => {
      lighthouse.on('close', (code) => {
        // Lighthouse may exit with non-zero code even on success in some cases
        // Check if report file exists instead
        const reportPath = path.join(__dirname, '..', 'lighthouse-report.json');
        if (fs.existsSync(reportPath)) {
          resolve();
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Lighthouse exited with code ${code}`));
        }
      });
      
      lighthouse.on('error', (error) => {
        reject(new Error(`Lighthouse error: ${error.message}`));
      });
    });

    // Read and parse Lighthouse report
    const reportPath = path.join(__dirname, '..', 'lighthouse-report.json');
    if (!fs.existsSync(reportPath)) {
      throw new Error('Lighthouse report not found');
    }

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const audits = report.audits;

    // Extract metrics
    const lcp = audits['largest-contentful-paint']?.numericValue || 0;
    const domNodes = audits['dom-size']?.numericValue || 0;

    // Check budgets
    const lcpBudget = budgets.budgets.lcp.maxTimeMs;
    const domNodesBudget = budgets.budgets.domNodes.maxCount;

    let hasErrors = false;

    console.log('\n📊 Lighthouse Performance Metrics\n');
    console.log(`LCP: ${lcp.toFixed(0)} ms / ${lcpBudget} ms`);
    console.log(`DOM Nodes: ${domNodes} / ${domNodesBudget}`);

    if (lcp > lcpBudget) {
      console.error(`\n❌ LCP budget exceeded: ${lcp.toFixed(0)} ms > ${lcpBudget} ms`);
      hasErrors = true;
    }

    if (domNodes > domNodesBudget) {
      console.error(`\n❌ DOM nodes budget exceeded: ${domNodes} > ${domNodesBudget}`);
      hasErrors = true;
    }

    if (hasErrors) {
      console.error('\n💥 Build failed due to Lighthouse budget violations.');
      console.error('Consider:');
      console.error('  - Optimizing images and using next/image');
      console.error('  - Reducing initial HTML size');
      console.error('  - Code splitting and lazy loading');
      console.error('  - Reducing DOM complexity');
      server.kill();
      process.exit(1);
    }

    console.log('\n✅ All Lighthouse budgets met!');

    // Clean up
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }

    server.kill();
    process.exit(0);
  } catch (error) {
    server.kill();
    console.error(`❌ Lighthouse check failed: ${error.message}`);
    process.exit(1);
  }
}

runLighthouseCheck().catch((error) => {
  console.error(`❌ Error: ${error.message}`);
  process.exit(1);
});
