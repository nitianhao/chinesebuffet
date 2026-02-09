#!/usr/bin/env node

/**
 * Standalone heading validation script
 * 
 * Usage: node scripts/validate-headings.js [file-path]
 * 
 * Validates heading hierarchy in buffet detail pages
 * 
 * Note: This is a simplified version. For full validation, use the TypeScript
 * version in lib/heading-validator.ts or the runtime HeadingValidator component.
 */

const fs = require('fs');
const path = require('path');

// Simplified validation logic (full version in TypeScript)
function extractHeadingsFromCode(code) {
  const headings = [];
  const headingRegex = /<h([1-4])([^>]*)>(.*?)<\/h[1-4]>/gs;
  let match;
  
  while ((match = headingRegex.exec(code)) !== null) {
    const level = parseInt(match[1], 10);
    const attributes = match[2];
    const text = match[3].replace(/<[^>]+>/g, '').trim();
    
    const idMatch = attributes.match(/id=["']([^"']+)["']/);
    const id = idMatch ? idMatch[1] : undefined;
    
    headings.push({
      level,
      text,
      id,
      line: code.substring(0, match.index).split('\n').length,
    });
  }
  
  return headings;
}

function validateHeadingHierarchy(headings) {
  const errors = [];
  const warnings = [];
  
  // Check for exactly one H1
  const h1Count = headings.filter(h => h.level === 1).length;
  if (h1Count === 0) {
    errors.push('Missing required H1: Buffet name + city + state');
  } else if (h1Count > 1) {
    errors.push(`Multiple H1 tags found: ${h1Count}. Only one H1 is allowed.`);
  }
  
  // Check H1 includes city and state
  const h1 = headings.find(h => h.level === 1);
  if (h1) {
    const h1Text = h1.text.toLowerCase();
    if (h1Text.split(',').length < 2 && !h1Text.includes(' in ')) {
      warnings.push('H1 may be missing city and state. Expected format: "Buffet Name in City, State"');
    }
  }
  
  // Check for skipped heading levels
  let previousLevel = 0;
  for (const heading of headings) {
    if (previousLevel > 0) {
      const levelDiff = heading.level - previousLevel;
      if (levelDiff > 1) {
        errors.push(
          `Skipped heading level: ${heading.text} (H${heading.level}) follows H${previousLevel}. ` +
          `Headings must be sequential (H${previousLevel} → H${previousLevel + 1} → H${heading.level}).`
        );
      }
    }
    previousLevel = heading.level;
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    headings,
  };
}

function main() {
  const filePath = process.argv[2] || 'app/chinese-buffets/[city-state]/[slug]/page.tsx';
  const fullPath = path.join(process.cwd(), filePath);

  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }

  const code = fs.readFileSync(fullPath, 'utf-8');
  const headings = extractHeadingsFromCode(code);
  const result = validateHeadingHierarchy(headings);

  console.log(`\n📋 Heading Validation Results for: ${filePath}\n`);
  console.log(`Found ${headings.length} headings:\n`);

  headings.forEach((h, i) => {
    const indent = '  '.repeat(h.level - 1);
    const idText = h.id ? ` (id="${h.id}")` : '';
    console.log(`${indent}H${h.level}: ${h.text}${idText}`);
  });

  console.log('\n' + '='.repeat(60) + '\n');

  if (result.valid && result.errors.length === 0 && result.warnings.length === 0) {
    console.log('✅ All heading rules passed!\n');
    process.exit(0);
  }

  if (result.errors.length > 0) {
    console.error('❌ ERRORS:\n');
    result.errors.forEach((error, i) => {
      console.error(`  ${i + 1}. ${error}`);
    });
    console.log('');
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  WARNINGS:\n');
    result.warnings.forEach((warning, i) => {
      console.warn(`  ${i + 1}. ${warning}`);
    });
    console.log('');
  }

  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { main };
