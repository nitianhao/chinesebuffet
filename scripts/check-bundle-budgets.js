#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const budgetsPath = path.join(__dirname, '..', 'performance-budgets.json');
const budgets = JSON.parse(fs.readFileSync(budgetsPath, 'utf8'));

const buildDir = path.join(__dirname, '..', '.next');
const staticDir = path.join(buildDir, 'static', 'chunks');

if (!fs.existsSync(buildDir)) {
  console.error('❌ Build directory not found. Run "next build" first.');
  process.exit(1);
}

if (!fs.existsSync(staticDir)) {
  console.error('❌ Static chunks directory not found. Build may have failed.');
  process.exit(1);
}

// Find all JS files in the static chunks directory
const getAllJSFiles = (dir) => {
  let files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files = files.concat(getAllJSFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  
  return files;
};

const jsFiles = getAllJSFiles(staticDir);

if (jsFiles.length === 0) {
  console.error('❌ No JavaScript files found in build output.');
  process.exit(1);
}

// Get file sizes
const fileSizes = jsFiles.map(file => {
  const stats = fs.statSync(file);
  const sizeKB = stats.size / 1024;
  const fileName = path.basename(file);
  return { path: file, fileName, sizeKB };
});

// Calculate total
const totalSize = fileSizes.reduce((sum, file) => sum + file.sizeKB, 0);

// Identify initial bundle
// In Next.js, the initial bundle is typically:
// 1. The main chunk (main-*.js or webpack-*.js)
// 2. The framework chunk (framework-*.js)
// 3. The pages/_app chunk if it exists
// We'll sum the main framework chunks that load initially
let initialSize = 0;
let initialChunks = fileSizes.filter(file => {
  const name = file.fileName.toLowerCase();
  // Match Next.js initial chunks
  return name.includes('main-') || 
         name.includes('framework-') || 
         name.includes('webpack-') ||
         (name.includes('pages/_app') && !name.includes('pages/_app-pages'));
});

if (initialChunks.length > 0) {
  // Sum the initial chunks (main + framework typically)
  initialSize = initialChunks.reduce((sum, file) => sum + file.sizeKB, 0);
} else {
  // Fallback: use the largest chunk as initial bundle estimate
  const sortedSizes = [...fileSizes].sort((a, b) => b.sizeKB - a.sizeKB);
  initialSize = sortedSizes[0]?.sizeKB || 0;
  initialChunks = [sortedSizes[0]].filter(Boolean);
  console.log('⚠️  Could not identify initial chunks, using largest chunk as estimate');
}

// Check budgets
const initialBudget = budgets.budgets.initialJS.maxSizeKB;
const totalBudget = budgets.budgets.totalJS.maxSizeKB;

let hasErrors = false;

console.log('\n📊 Bundle Size Analysis\n');
console.log(`Initial JS: ${initialSize.toFixed(2)} KB / ${initialBudget} KB`);
if (initialChunks.length > 0) {
  console.log(`  (sum of ${initialChunks.length} initial chunks)`);
}
console.log(`Total JS: ${totalSize.toFixed(2)} KB / ${totalBudget} KB`);
console.log(`\nTop 5 largest chunks:`);
fileSizes.sort((a, b) => b.sizeKB - a.sizeKB);
fileSizes.slice(0, 5).forEach((file, index) => {
  const relativePath = path.relative(buildDir, file.path);
  const isInitial = initialChunks.length > 0 && initialChunks.some(c => c.path === file.path);
  const marker = isInitial ? ' [initial]' : '';
  console.log(`  ${index + 1}. ${relativePath}: ${file.sizeKB.toFixed(2)} KB${marker}`);
});

if (initialSize > initialBudget) {
  console.error(`\n❌ Initial JS budget exceeded: ${initialSize.toFixed(2)} KB > ${initialBudget} KB`);
  hasErrors = true;
}

if (totalSize > totalBudget) {
  console.error(`\n❌ Total JS budget exceeded: ${totalSize.toFixed(2)} KB > ${totalBudget} KB`);
  hasErrors = true;
}

if (hasErrors) {
  console.error('\n💥 Build failed due to bundle size budget violations.');
  console.error('Consider:');
  console.error('  - Code splitting and lazy loading');
  console.error('  - Removing unused dependencies');
  console.error('  - Optimizing imports');
  console.error('  - Using dynamic imports for large components');
  process.exit(1);
}

console.log('\n✅ All bundle size budgets met!');
process.exit(0);
