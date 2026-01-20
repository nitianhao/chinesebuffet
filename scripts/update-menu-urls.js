// Script to update menu1 and menu2 fields
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'buffets-urls-websites.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const updated = data.map(r => {
  let menu1 = null;
  let menu2 = null;
  
  if (r.website) {
    try {
      // Use URL constructor to properly handle URLs with query parameters
      const url1 = new URL(r.website);
      const url2 = new URL(r.website);
      
      // Append /menu to the pathname for menu1
      const pathname1 = url1.pathname.endsWith('/') 
        ? url1.pathname + 'menu' 
        : url1.pathname + '/menu';
      url1.pathname = pathname1;
      menu1 = url1.toString();
      
      // Append /menus to the pathname for menu2
      const pathname2 = url2.pathname.endsWith('/') 
        ? url2.pathname + 'menus' 
        : url2.pathname + '/menus';
      url2.pathname = pathname2;
      menu2 = url2.toString();
    } catch (e) {
      // If URL parsing fails (invalid URL), use simple string append
      const website1 = r.website.endsWith('/') 
        ? r.website + 'menu' 
        : r.website + '/menu';
      menu1 = website1;
      
      const website2 = r.website.endsWith('/') 
        ? r.website + 'menus' 
        : r.website + '/menus';
      menu2 = website2;
    }
  }
  
  return {
    PlaceID: r.PlaceID,
    Name: r.Name,
    website: r.website,
    menu1: menu1,
    menu2: menu2
  };
});

fs.writeFileSync(dataPath, JSON.stringify(updated, null, 2), 'utf8');

console.log('Updated', updated.length, 'records');
console.log('Records with menu1:', updated.filter(r => r.menu1).length);
console.log('Records with menu2:', updated.filter(r => r.menu2).length);
console.log('Sample menu1 URLs:');
updated.filter(r => r.menu1).slice(0, 3).forEach(r => {
  console.log(`  ${r.Name}: ${r.menu1}`);
});
console.log('Sample menu2 URLs:');
updated.filter(r => r.menu2).slice(0, 3).forEach(r => {
  console.log(`  ${r.Name}: ${r.menu2}`);
});

