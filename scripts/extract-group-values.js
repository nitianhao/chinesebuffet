// Quick script to extract unique group values from the categoryToGroup mapping
const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, 'label-poi-groups.js');
const scriptContent = fs.readFileSync(scriptPath, 'utf8');

// Extract the categoryToGroup object by finding it in the script
// This is a simple extraction - we'll look for the pattern
const categoryToGroupMatch = scriptContent.match(/const categoryToGroup = \{([\s\S]*?)\};/);

if (categoryToGroupMatch) {
  const mappingContent = categoryToGroupMatch[1];
  
  // Extract all group values (strings after the colon)
  const groupMatches = mappingContent.matchAll(/'([^']+)':\s*'([^']+)'/g);
  
  const uniqueGroups = new Set();
  for (const match of groupMatches) {
    uniqueGroups.add(match[2]); // match[2] is the group value
  }
  
  // Also add the default fallback
  uniqueGroups.add('Miscellaneous Services');
  
  const sortedGroups = Array.from(uniqueGroups).sort();
  
  console.log('=== Unique Group Values (from mapping) ===');
  console.log(`Total: ${sortedGroups.length} unique groups\n`);
  sortedGroups.forEach((group, index) => {
    console.log(`${index + 1}. ${group}`);
  });
  
  console.log('\n=== Copy-paste ready list ===');
  sortedGroups.forEach(group => {
    console.log(group);
  });
} else {
  console.error('Could not find categoryToGroup mapping in script');
}
