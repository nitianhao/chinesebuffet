// MSA (Metropolitan Statistical Area) enrichment script
// Enriches cities with MSA/CSA data from US Census Bureau
// Data source: US Census Bureau (free, updated annually)

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load schema
let schema;
try {
  schema = require('../../src/instant.schema.ts');
} catch (e) {
  // Try default export
  schema = require('../../src/instant.schema.ts').default;
}

// Load environment variables from .env.local
try {
  const envPath = path.join(__dirname, '../../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      // Skip comments and empty lines
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const match = trimmedLine.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key] && value) {
            process.env[key] = value;
          }
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Please set it in .env.local or as an environment variable');
  process.exit(1);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// MSA to City mapping
// This is a simplified mapping - in production, you'd load from Census CSV or API
// For now, we'll use a lookup table for major cities
const MSA_MAPPINGS = {
  // Format: "City, StateAbbr": { msaName, msaCode, csaName }
  "Los Angeles, CA": {
    msaName: "Los Angeles-Long Beach-Anaheim, CA Metropolitan Statistical Area",
    msaCode: "31080",
    csaName: "Los Angeles-Long Beach, CA Combined Statistical Area"
  },
  "New York, NY": {
    msaName: "New York-Newark-Jersey City, NY-NJ-PA Metropolitan Statistical Area",
    msaCode: "35620",
    csaName: "New York-Newark, NY-NJ-CT-PA Combined Statistical Area"
  },
  "Chicago, IL": {
    msaName: "Chicago-Naperville-Elgin, IL-IN-WI Metropolitan Statistical Area",
    msaCode: "16980",
    csaName: "Chicago-Naperville, IL-IN-WI Combined Statistical Area"
  },
  "Houston, TX": {
    msaName: "Houston-The Woodlands-Sugar Land, TX Metropolitan Statistical Area",
    msaCode: "26420",
    csaName: "Houston-The Woodlands, TX Combined Statistical Area"
  },
  "Phoenix, AZ": {
    msaName: "Phoenix-Mesa-Chandler, AZ Metropolitan Statistical Area",
    msaCode: "38060",
    csaName: "Phoenix-Mesa, AZ Combined Statistical Area"
  },
  "Philadelphia, PA": {
    msaName: "Philadelphia-Camden-Wilmington, PA-NJ-DE-MD Metropolitan Statistical Area",
    msaCode: "37980",
    csaName: "Philadelphia-Reading-Camden, PA-NJ-DE-MD Combined Statistical Area"
  },
  "San Antonio, TX": {
    msaName: "San Antonio-New Braunfels, TX Metropolitan Statistical Area",
    msaCode: "41700",
    csaName: "San Antonio-New Braunfels, TX Combined Statistical Area"
  },
  "San Diego, CA": {
    msaName: "San Diego-Chula Vista-Carlsbad, CA Metropolitan Statistical Area",
    msaCode: "41740",
    csaName: "San Diego-Chula Vista-Carlsbad, CA Combined Statistical Area"
  },
  "Dallas, TX": {
    msaName: "Dallas-Fort Worth-Arlington, TX Metropolitan Statistical Area",
    msaCode: "19100",
    csaName: "Dallas-Fort Worth, TX-OK Combined Statistical Area"
  },
  "San Jose, CA": {
    msaName: "San Jose-Sunnyvale-Santa Clara, CA Metropolitan Statistical Area",
    msaCode: "41940",
    csaName: "San Jose-San Francisco-Oakland, CA Combined Statistical Area"
  },
  "Austin, TX": {
    msaName: "Austin-Round Rock-Georgetown, TX Metropolitan Statistical Area",
    msaCode: "12420",
    csaName: "Austin-Round Rock-San Marcos, TX Combined Statistical Area"
  },
  "Jacksonville, FL": {
    msaName: "Jacksonville, FL Metropolitan Statistical Area",
    msaCode: "27260",
    csaName: "Jacksonville-St. Marys-Palatka, FL-GA Combined Statistical Area"
  },
  "Fort Worth, TX": {
    msaName: "Dallas-Fort Worth-Arlington, TX Metropolitan Statistical Area",
    msaCode: "19100",
    csaName: "Dallas-Fort Worth, TX-OK Combined Statistical Area"
  },
  "Columbus, OH": {
    msaName: "Columbus, OH Metropolitan Statistical Area",
    msaCode: "18140",
    csaName: "Columbus-Marion-Zanesville, OH Combined Statistical Area"
  },
  "Charlotte, NC": {
    msaName: "Charlotte-Concord-Gastonia, NC-SC Metropolitan Statistical Area",
    msaCode: "16740",
    csaName: "Charlotte-Concord, NC-SC Combined Statistical Area"
  },
  "San Francisco, CA": {
    msaName: "San Francisco-Oakland-Berkeley, CA Metropolitan Statistical Area",
    msaCode: "41860",
    csaName: "San Jose-San Francisco-Oakland, CA Combined Statistical Area"
  },
  "Indianapolis, IN": {
    msaName: "Indianapolis-Carmel-Anderson, IN Metropolitan Statistical Area",
    msaCode: "26900",
    csaName: "Indianapolis-Carmel-Muncie, IN Combined Statistical Area"
  },
  "Seattle, WA": {
    msaName: "Seattle-Tacoma-Bellevue, WA Metropolitan Statistical Area",
    msaCode: "42660",
    csaName: "Seattle-Tacoma, WA Combined Statistical Area"
  },
  "Denver, CO": {
    msaName: "Denver-Aurora-Lakewood, CO Metropolitan Statistical Area",
    msaCode: "19740",
    csaName: "Denver-Aurora, CO Combined Statistical Area"
  },
  "Washington, DC": {
    msaName: "Washington-Arlington-Alexandria, DC-VA-MD-WV Metropolitan Statistical Area",
    msaCode: "47900",
    csaName: "Washington-Baltimore-Arlington, DC-MD-VA-WV-PA Combined Statistical Area"
  },
  "Boston, MA": {
    msaName: "Boston-Cambridge-Newton, MA-NH Metropolitan Statistical Area",
    msaCode: "14460",
    csaName: "Boston-Worcester-Providence, MA-RI-NH-CT Combined Statistical Area"
  },
  "El Paso, TX": {
    msaName: "El Paso, TX Metropolitan Statistical Area",
    msaCode: "21340",
    csaName: "El Paso-Las Cruces, TX-NM Combined Statistical Area"
  },
  "Detroit, MI": {
    msaName: "Detroit-Warren-Dearborn, MI Metropolitan Statistical Area",
    msaCode: "19820",
    csaName: "Detroit-Warren-Ann Arbor, MI Combined Statistical Area"
  },
  "Nashville, TN": {
    msaName: "Nashville-Davidson--Murfreesboro--Franklin, TN Metropolitan Statistical Area",
    msaCode: "34980",
    csaName: "Nashville-Davidson--Murfreesboro, TN Combined Statistical Area"
  },
  "Portland, OR": {
    msaName: "Portland-Vancouver-Hillsboro, OR-WA Metropolitan Statistical Area",
    msaCode: "38900",
    csaName: "Portland-Vancouver-Salem, OR-WA Combined Statistical Area"
  },
  "Memphis, TN": {
    msaName: "Memphis, TN-MS-AR Metropolitan Statistical Area",
    msaCode: "32820",
    csaName: "Memphis-Forrest City, TN-MS-AR Combined Statistical Area"
  },
  "Oklahoma City, OK": {
    msaName: "Oklahoma City, OK Metropolitan Statistical Area",
    msaCode: "36420",
    csaName: "Oklahoma City-Shawnee, OK Combined Statistical Area"
  },
  "Las Vegas, NV": {
    msaName: "Las Vegas-Henderson-Paradise, NV Metropolitan Statistical Area",
    msaCode: "29820",
    csaName: "Las Vegas-Henderson, NV-AZ Combined Statistical Area"
  },
  "Louisville, KY": {
    msaName: "Louisville/Jefferson County, KY-IN Metropolitan Statistical Area",
    msaCode: "31140",
    csaName: "Louisville-Jefferson County--Elizabethtown--Madison, KY-IN Combined Statistical Area"
  },
  "Baltimore, MD": {
    msaName: "Baltimore-Columbia-Towson, MD Metropolitan Statistical Area",
    msaCode: "12580",
    csaName: "Washington-Baltimore-Arlington, DC-MD-VA-WV-PA Combined Statistical Area"
  },
  "Milwaukee, WI": {
    msaName: "Milwaukee-Waukesha, WI Metropolitan Statistical Area",
    msaCode: "33340",
    csaName: "Milwaukee-Racine-Waukesha, WI Combined Statistical Area"
  },
  "Albuquerque, NM": {
    msaName: "Albuquerque, NM Metropolitan Statistical Area",
    msaCode: "10740",
    csaName: "Albuquerque-Santa Fe-Las Vegas, NM Combined Statistical Area"
  },
  "Tucson, AZ": {
    msaName: "Tucson, AZ Metropolitan Statistical Area",
    msaCode: "46060",
    csaName: "Tucson-Nogales, AZ Combined Statistical Area"
  },
  "Fresno, CA": {
    msaName: "Fresno, CA Metropolitan Statistical Area",
    msaCode: "23420",
    csaName: "Fresno-Madera-Hanford, CA Combined Statistical Area"
  },
  "Sacramento, CA": {
    msaName: "Sacramento-Roseville-Folsom, CA Metropolitan Statistical Area",
    msaCode: "40900",
    csaName: "Sacramento-Roseville, CA Combined Statistical Area"
  },
  "Kansas City, MO": {
    msaName: "Kansas City, MO-KS Metropolitan Statistical Area",
    msaCode: "28140",
    csaName: "Kansas City-Overland Park-Kansas City, MO-KS Combined Statistical Area"
  },
  "Mesa, AZ": {
    msaName: "Phoenix-Mesa-Chandler, AZ Metropolitan Statistical Area",
    msaCode: "38060",
    csaName: "Phoenix-Mesa, AZ Combined Statistical Area"
  },
  "Atlanta, GA": {
    msaName: "Atlanta-Sandy Springs-Alpharetta, GA Metropolitan Statistical Area",
    msaCode: "12060",
    csaName: "Atlanta--Athens-Clarke County--Sandy Springs, GA Combined Statistical Area"
  },
  "Omaha, NE": {
    msaName: "Omaha-Council Bluffs, NE-IA Metropolitan Statistical Area",
    msaCode: "36540",
    csaName: "Omaha-Council Bluffs-Fremont, NE-IA Combined Statistical Area"
  },
  "Colorado Springs, CO": {
    msaName: "Colorado Springs, CO Metropolitan Statistical Area",
    msaCode: "17820",
    csaName: "Pueblo-Cañon City, CO Combined Statistical Area"
  },
  "Raleigh, NC": {
    msaName: "Raleigh-Cary, NC Metropolitan Statistical Area",
    msaCode: "39580",
    csaName: "Raleigh-Durham-Cary, NC Combined Statistical Area"
  },
  "Virginia Beach, VA": {
    msaName: "Virginia Beach-Norfolk-Newport News, VA-NC Metropolitan Statistical Area",
    msaCode: "47260",
    csaName: "Virginia Beach-Norfolk, VA-NC Combined Statistical Area"
  },
  "Miami, FL": {
    msaName: "Miami-Fort Lauderdale-Pompano Beach, FL Metropolitan Statistical Area",
    msaCode: "33100",
    csaName: "Miami-Fort Lauderdale-Port St. Lucie, FL Combined Statistical Area"
  },
  "Oakland, CA": {
    msaName: "San Francisco-Oakland-Berkeley, CA Metropolitan Statistical Area",
    msaCode: "41860",
    csaName: "San Jose-San Francisco-Oakland, CA Combined Statistical Area"
  },
  "Minneapolis, MN": {
    msaName: "Minneapolis-St. Paul-Bloomington, MN-WI Metropolitan Statistical Area",
    msaCode: "33460",
    csaName: "Minneapolis-St. Paul, MN-WI Combined Statistical Area"
  },
  "Tulsa, OK": {
    msaName: "Tulsa, OK Metropolitan Statistical Area",
    msaCode: "46140",
    csaName: "Tulsa-Muskogee-Bartlesville, OK Combined Statistical Area"
  },
  "Cleveland, OH": {
    msaName: "Cleveland-Elyria, OH Metropolitan Statistical Area",
    msaCode: "17460",
    csaName: "Cleveland-Akron-Canton, OH Combined Statistical Area"
  },
  "Wichita, KS": {
    msaName: "Wichita, KS Metropolitan Statistical Area",
    msaCode: "48620",
    csaName: "Wichita-Winfield, KS Combined Statistical Area"
  },
  "Arlington, TX": {
    msaName: "Dallas-Fort Worth-Arlington, TX Metropolitan Statistical Area",
    msaCode: "19100",
    csaName: "Dallas-Fort Worth, TX-OK Combined Statistical Area"
  },
  "New Orleans, LA": {
    msaName: "New Orleans-Metairie, LA Metropolitan Statistical Area",
    msaCode: "35300",
    csaName: "New Orleans-Metairie-Hammond, LA-MS Combined Statistical Area"
  },
  "Honolulu, HI": {
    msaName: "Urban Honolulu, HI Metropolitan Statistical Area",
    msaCode: "46520",
    csaName: null // No CSA
  },
  "Anaheim, CA": {
    msaName: "Los Angeles-Long Beach-Anaheim, CA Metropolitan Statistical Area",
    msaCode: "31080",
    csaName: "Los Angeles-Long Beach, CA Combined Statistical Area"
  },
  "Santa Ana, CA": {
    msaName: "Los Angeles-Long Beach-Anaheim, CA Metropolitan Statistical Area",
    msaCode: "31080",
    csaName: "Los Angeles-Long Beach, CA Combined Statistical Area"
  },
  "St. Louis, MO": {
    msaName: "St. Louis, MO-IL Metropolitan Statistical Area",
    msaCode: "41180",
    csaName: "St. Louis-St. Charles-Farmington, MO-IL Combined Statistical Area"
  },
  "Riverside, CA": {
    msaName: "Riverside-San Bernardino-Ontario, CA Metropolitan Statistical Area",
    msaCode: "40140",
    csaName: "Los Angeles-Long Beach, CA Combined Statistical Area"
  },
  "Corpus Christi, TX": {
    msaName: "Corpus Christi, TX Metropolitan Statistical Area",
    msaCode: "18580",
    csaName: "Corpus Christi-Kingsville-Alice, TX Combined Statistical Area"
  },
  "Lexington, KY": {
    msaName: "Lexington-Fayette, KY Metropolitan Statistical Area",
    msaCode: "30460",
    csaName: "Lexington-Fayette--Richmond--Frankfort, KY Combined Statistical Area"
  },
  "Henderson, NV": {
    msaName: "Las Vegas-Henderson-Paradise, NV Metropolitan Statistical Area",
    msaCode: "29820",
    csaName: "Las Vegas-Henderson, NV-AZ Combined Statistical Area"
  },
  "Stockton, CA": {
    msaName: "Stockton, CA Metropolitan Statistical Area",
    msaCode: "44700",
    csaName: "San Jose-San Francisco-Oakland, CA Combined Statistical Area"
  },
  "St. Paul, MN": {
    msaName: "Minneapolis-St. Paul-Bloomington, MN-WI Metropolitan Statistical Area",
    msaCode: "33460",
    csaName: "Minneapolis-St. Paul, MN-WI Combined Statistical Area"
  },
  "Cincinnati, OH": {
    msaName: "Cincinnati, OH-KY-IN Metropolitan Statistical Area",
    msaCode: "17140",
    csaName: "Cincinnati-Wilmington-Maysville, OH-KY-IN Combined Statistical Area"
  },
  "St. Petersburg, FL": {
    msaName: "Tampa-St. Petersburg-Clearwater, FL Metropolitan Statistical Area",
    msaCode: "45300",
    csaName: "Tampa-St. Petersburg-Clearwater, FL Combined Statistical Area"
  },
  "Pittsburgh, PA": {
    msaName: "Pittsburgh, PA Metropolitan Statistical Area",
    msaCode: "38300",
    csaName: "Pittsburgh-New Castle-Weirton, PA-OH-WV Combined Statistical Area"
  },
  "Greensboro, NC": {
    msaName: "Greensboro-High Point, NC Metropolitan Statistical Area",
    msaCode: "24660",
    csaName: "Greensboro--Winston-Salem--High Point, NC Combined Statistical Area"
  },
  "Lincoln, NE": {
    msaName: "Lincoln, NE Metropolitan Statistical Area",
    msaCode: "30780",
    csaName: "Lincoln-Beatrice, NE Combined Statistical Area"
  },
  "Anchorage, AK": {
    msaName: "Anchorage, AK Metropolitan Statistical Area",
    msaCode: "11260",
    csaName: null // No CSA
  },
  "Plano, TX": {
    msaName: "Dallas-Fort Worth-Arlington, TX Metropolitan Statistical Area",
    msaCode: "19100",
    csaName: "Dallas-Fort Worth, TX-OK Combined Statistical Area"
  },
  "Orlando, FL": {
    msaName: "Orlando-Kissimmee-Sanford, FL Metropolitan Statistical Area",
    msaCode: "36740",
    csaName: "Orlando-Lakeland-Deltona, FL Combined Statistical Area"
  },
  "Irvine, CA": {
    msaName: "Los Angeles-Long Beach-Anaheim, CA Metropolitan Statistical Area",
    msaCode: "31080",
    csaName: "Los Angeles-Long Beach, CA Combined Statistical Area"
  },
  "Newark, NJ": {
    msaName: "New York-Newark-Jersey City, NY-NJ-PA Metropolitan Statistical Area",
    msaCode: "35620",
    csaName: "New York-Newark, NY-NJ-CT-PA Combined Statistical Area"
  },
  "Durham, NC": {
    msaName: "Durham-Chapel Hill, NC Metropolitan Statistical Area",
    msaCode: "20500",
    csaName: "Raleigh-Durham-Cary, NC Combined Statistical Area"
  },
  "Chula Vista, CA": {
    msaName: "San Diego-Chula Vista-Carlsbad, CA Metropolitan Statistical Area",
    msaCode: "41740",
    csaName: "San Diego-Chula Vista-Carlsbad, CA Combined Statistical Area"
  },
  "Toledo, OH": {
    msaName: "Toledo, OH Metropolitan Statistical Area",
    msaCode: "45780",
    csaName: "Toledo-Port Clinton, OH Combined Statistical Area"
  },
  "Fort Wayne, IN": {
    msaName: "Fort Wayne, IN Metropolitan Statistical Area",
    msaCode: "23060",
    csaName: "Fort Wayne-Huntington-Auburn, IN Combined Statistical Area"
  },
  "St. Petersburg, FL": {
    msaName: "Tampa-St. Petersburg-Clearwater, FL Metropolitan Statistical Area",
    msaCode: "45300",
    csaName: "Tampa-St. Petersburg-Clearwater, FL Combined Statistical Area"
  },
  "Laredo, TX": {
    msaName: "Laredo, TX Metropolitan Statistical Area",
    msaCode: "29700",
    csaName: null // No CSA
  },
  "Jersey City, NJ": {
    msaName: "New York-Newark-Jersey City, NY-NJ-PA Metropolitan Statistical Area",
    msaCode: "35620",
    csaName: "New York-Newark, NY-NJ-CT-PA Combined Statistical Area"
  },
  "Chandler, AZ": {
    msaName: "Phoenix-Mesa-Chandler, AZ Metropolitan Statistical Area",
    msaCode: "38060",
    csaName: "Phoenix-Mesa, AZ Combined Statistical Area"
  },
  "Madison, WI": {
    msaName: "Madison, WI Metropolitan Statistical Area",
    msaCode: "31540",
    csaName: "Madison-Janesville-Beloit, WI Combined Statistical Area"
  },
  "Lubbock, TX": {
    msaName: "Lubbock, TX Metropolitan Statistical Area",
    msaCode: "31180",
    csaName: "Lubbock-Levelland, TX Combined Statistical Area"
  },
  "Scottsdale, AZ": {
    msaName: "Phoenix-Mesa-Chandler, AZ Metropolitan Statistical Area",
    msaCode: "38060",
    csaName: "Phoenix-Mesa, AZ Combined Statistical Area"
  },
  "Reno, NV": {
    msaName: "Reno, NV Metropolitan Statistical Area",
    msaCode: "39900",
    csaName: "Reno-Carson City-Fernley, NV Combined Statistical Area"
  },
  "Buffalo, NY": {
    msaName: "Buffalo-Cheektowaga, NY Metropolitan Statistical Area",
    msaCode: "15380",
    csaName: "Buffalo-Cheektowaga, NY Combined Statistical Area"
  },
  "Gilbert, AZ": {
    msaName: "Phoenix-Mesa-Chandler, AZ Metropolitan Statistical Area",
    msaCode: "38060",
    csaName: "Phoenix-Mesa, AZ Combined Statistical Area"
  },
  "Glendale, AZ": {
    msaName: "Phoenix-Mesa-Chandler, AZ Metropolitan Statistical Area",
    msaCode: "38060",
    csaName: "Phoenix-Mesa, AZ Combined Statistical Area"
  },
  "North Las Vegas, NV": {
    msaName: "Las Vegas-Henderson-Paradise, NV Metropolitan Statistical Area",
    msaCode: "29820",
    csaName: "Las Vegas-Henderson, NV-AZ Combined Statistical Area"
  },
  "Winston-Salem, NC": {
    msaName: "Winston-Salem, NC Metropolitan Statistical Area",
    msaCode: "49180",
    csaName: "Greensboro--Winston-Salem--High Point, NC Combined Statistical Area"
  },
  "Chesapeake, VA": {
    msaName: "Virginia Beach-Norfolk-Newport News, VA-NC Metropolitan Statistical Area",
    msaCode: "47260",
    csaName: "Virginia Beach-Norfolk, VA-NC Combined Statistical Area"
  },
  "Norfolk, VA": {
    msaName: "Virginia Beach-Norfolk-Newport News, VA-NC Metropolitan Statistical Area",
    msaCode: "47260",
    csaName: "Virginia Beach-Norfolk, VA-NC Combined Statistical Area"
  },
  "Fremont, CA": {
    msaName: "San Francisco-Oakland-Berkeley, CA Metropolitan Statistical Area",
    msaCode: "41860",
    csaName: "San Jose-San Francisco-Oakland, CA Combined Statistical Area"
  },
  "Garland, TX": {
    msaName: "Dallas-Fort Worth-Arlington, TX Metropolitan Statistical Area",
    msaCode: "19100",
    csaName: "Dallas-Fort Worth, TX-OK Combined Statistical Area"
  },
  "Irving, TX": {
    msaName: "Dallas-Fort Worth-Arlington, TX Metropolitan Statistical Area",
    msaCode: "19100",
    csaName: "Dallas-Fort Worth, TX-OK Combined Statistical Area"
  },
  "Hialeah, FL": {
    msaName: "Miami-Fort Lauderdale-Pompano Beach, FL Metropolitan Statistical Area",
    msaCode: "33100",
    csaName: "Miami-Fort Lauderdale-Port St. Lucie, FL Combined Statistical Area"
  },
  "Richmond, VA": {
    msaName: "Richmond, VA Metropolitan Statistical Area",
    msaCode: "40060",
    csaName: "Richmond, VA Combined Statistical Area"
  },
  "Boise, ID": {
    msaName: "Boise City, ID Metropolitan Statistical Area",
    msaCode: "14260",
    csaName: "Boise City-Mountain Home-Ontario, ID-OR Combined Statistical Area"
  },
  "Spokane, WA": {
    msaName: "Spokane-Spokane Valley, WA Metropolitan Statistical Area",
    msaCode: "44060",
    csaName: "Spokane-Spokane Valley-Coeur d'Alene, WA-ID Combined Statistical Area"
  },
  "Baton Rouge, LA": {
    msaName: "Baton Rouge, LA Metropolitan Statistical Area",
    msaCode: "12940",
    csaName: "Baton Rouge-Pierre Part, LA Combined Statistical Area"
  },
  "Tacoma, WA": {
    msaName: "Seattle-Tacoma-Bellevue, WA Metropolitan Statistical Area",
    msaCode: "42660",
    csaName: "Seattle-Tacoma, WA Combined Statistical Area"
  },
  "San Bernardino, CA": {
    msaName: "Riverside-San Bernardino-Ontario, CA Metropolitan Statistical Area",
    msaCode: "40140",
    csaName: "Los Angeles-Long Beach, CA Combined Statistical Area"
  },
  "Modesto, CA": {
    msaName: "Modesto, CA Metropolitan Statistical Area",
    msaCode: "33740",
    csaName: "San Jose-San Francisco-Oakland, CA Combined Statistical Area"
  },
  "Fontana, CA": {
    msaName: "Riverside-San Bernardino-Ontario, CA Metropolitan Statistical Area",
    msaCode: "40140",
    csaName: "Los Angeles-Long Beach, CA Combined Statistical Area"
  },
  "Des Moines, IA": {
    msaName: "Des Moines-West Des Moines, IA Metropolitan Statistical Area",
    msaCode: "19780",
    csaName: "Des Moines-West Des Moines-Ames, IA Combined Statistical Area"
  },
  "Moreno Valley, CA": {
    msaName: "Riverside-San Bernardino-Ontario, CA Metropolitan Statistical Area",
    msaCode: "40140",
    csaName: "Los Angeles-Long Beach, CA Combined Statistical Area"
  },
  "Santa Clarita, CA": {
    msaName: "Los Angeles-Long Beach-Anaheim, CA Metropolitan Statistical Area",
    msaCode: "31080",
    csaName: "Los Angeles-Long Beach, CA Combined Statistical Area"
  },
  "Fayetteville, NC": {
    msaName: "Fayetteville, NC Metropolitan Statistical Area",
    msaCode: "22180",
    csaName: "Fayetteville-Sanford-Lumberton, NC Combined Statistical Area"
  },
  "Birmingham, AL": {
    msaName: "Birmingham-Hoover, AL Metropolitan Statistical Area",
    msaCode: "13820",
    csaName: "Birmingham-Hoover-Talladega, AL Combined Statistical Area"
  },
  "Oxnard, CA": {
    msaName: "Oxnard-Thousand Oaks-Ventura, CA Metropolitan Statistical Area",
    msaCode: "37100",
    csaName: "Los Angeles-Long Beach, CA Combined Statistical Area"
  },
  "Rochester, NY": {
    msaName: "Rochester, NY Metropolitan Statistical Area",
    msaCode: "40380",
    csaName: "Rochester-Batavia-Seneca Falls, NY Combined Statistical Area"
  },
  "Port St. Lucie, FL": {
    msaName: "Port St. Lucie, FL Metropolitan Statistical Area",
    msaCode: "38940",
    csaName: "Miami-Fort Lauderdale-Port St. Lucie, FL Combined Statistical Area"
  },
  "Grand Rapids, MI": {
    msaName: "Grand Rapids-Kentwood, MI Metropolitan Statistical Area",
    msaCode: "24340",
    csaName: "Grand Rapids-Wyoming-Kentwood, MI Combined Statistical Area"
  },
  "Huntsville, AL": {
    msaName: "Huntsville, AL Metropolitan Statistical Area",
    msaCode: "26620",
    csaName: "Huntsville-Decatur, AL Combined Statistical Area"
  },
  "Salt Lake City, UT": {
    msaName: "Salt Lake City, UT Metropolitan Statistical Area",
    msaCode: "41620",
    csaName: "Salt Lake City-Provo-Orem, UT Combined Statistical Area"
  },
  "Frisco, TX": {
    msaName: "Dallas-Fort Worth-Arlington, TX Metropolitan Statistical Area",
    msaCode: "19100",
    csaName: "Dallas-Fort Worth, TX-OK Combined Statistical Area"
  },
  "Yonkers, NY": {
    msaName: "New York-Newark-Jersey City, NY-NJ-PA Metropolitan Statistical Area",
    msaCode: "35620",
    csaName: "New York-Newark, NY-NJ-CT-PA Combined Statistical Area"
  },
  "Amarillo, TX": {
    msaName: "Amarillo, TX Metropolitan Statistical Area",
    msaCode: "11100",
    csaName: "Amarillo-Pampa-Borger, TX Combined Statistical Area"
  },
  "Glendale, CA": {
    msaName: "Los Angeles-Long Beach-Anaheim, CA Metropolitan Statistical Area",
    msaCode: "31080",
    csaName: "Los Angeles-Long Beach, CA Combined Statistical Area"
  },
  "McKinney, TX": {
    msaName: "Dallas-Fort Worth-Arlington, TX Metropolitan Statistical Area",
    msaCode: "19100",
    csaName: "Dallas-Fort Worth, TX-OK Combined Statistical Area"
  },
  "Montgomery, AL": {
    msaName: "Montgomery, AL Metropolitan Statistical Area",
    msaCode: "33860",
    csaName: "Montgomery-Alexander City, AL Combined Statistical Area"
  },
  "Aurora, IL": {
    msaName: "Chicago-Naperville-Elgin, IL-IN-WI Metropolitan Statistical Area",
    msaCode: "16980",
    csaName: "Chicago-Naperville, IL-IN-WI Combined Statistical Area"
  },
  "Akron, OH": {
    msaName: "Akron, OH Metropolitan Statistical Area",
    msaCode: "10420",
    csaName: "Cleveland-Akron-Canton, OH Combined Statistical Area"
  },
  "Little Rock, AR": {
    msaName: "Little Rock-North Little Rock-Conway, AR Metropolitan Statistical Area",
    msaCode: "30780",
    csaName: "Little Rock-North Little Rock, AR Combined Statistical Area"
  }
};

/**
 * Get MSA data for a city
 * @param {string} cityName - City name
 * @param {string} stateAbbr - State abbreviation
 * @returns {Object|null} MSA data or null if not found
 */
function getMSAData(cityName, stateAbbr) {
  const key = `${cityName}, ${stateAbbr}`;
  return MSA_MAPPINGS[key] || null;
}

/**
 * Enrich cities with MSA data
 * @param {number|null} testLimit - Optional limit on number of cities to process (for testing)
 */
async function enrichMSA(testLimit = null) {
  console.log('Starting MSA enrichment...\n');
  
  // Fetch all cities
  let allCities = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const result = await db.query({
      cities: {
        $: {
          limit: limit,
          offset: offset,
        }
      }
    });
    
    const cities = result.cities || [];
    if (cities.length === 0) break;
    
    allCities = allCities.concat(cities);
    if (cities.length < limit) break;
    offset += limit;
    
    // If test limit is set, stop when we have enough cities
    if (testLimit && allCities.length >= testLimit) {
      allCities = allCities.slice(0, testLimit);
      break;
    }
  }
  
  if (testLimit) {
    console.log(`Found ${allCities.length} cities (limited to ${testLimit} for testing)\n`);
  } else {
    console.log(`Found ${allCities.length} cities in database\n`);
  }
  
  const BATCH_SIZE = 50;
  let enrichedCount = 0;
  let skippedCount = 0;
  const updateTxs = [];
  
  for (let i = 0; i < allCities.length; i++) {
    const city = allCities[i];
    
    // Skip if already has MSA data
    if (city.msaName && city.msaCode) {
      skippedCount++;
      continue;
    }
    
    // Get MSA data
    const msaData = getMSAData(city.city, city.stateAbbr);
    
    if (!msaData) {
      skippedCount++;
      if (i % 100 === 0 || i === allCities.length - 1) {
        console.log(`  [${((i + 1) / allCities.length * 100).toFixed(1)}%] ${city.city}, ${city.stateAbbr} - No MSA mapping found`);
      }
      continue;
    }
    
    // Prepare update data
    const updateData = {
      msaName: msaData.msaName,
      msaCode: msaData.msaCode,
    };
    
    if (msaData.csaName) {
      updateData.csaName = msaData.csaName;
    }
    
    updateTxs.push(
      db.tx.cities[city.id].update(updateData)
    );
    enrichedCount++;
    
    if (i % 10 === 0 || i === allCities.length - 1) {
      const percent = ((i + 1) / allCities.length * 100).toFixed(1);
      console.log(`  [${percent}%] Enriched ${city.city}, ${city.stateAbbr} - MSA: ${msaData.msaName.substring(0, 50)}...`);
    }
    
    // Commit batch
    if (updateTxs.length >= BATCH_SIZE || i === allCities.length - 1) {
      if (updateTxs.length > 0) {
        try {
          await db.transact(updateTxs);
          const batchNum = Math.floor(updateTxs.length / BATCH_SIZE) + 1;
          console.log(`    ✓ Committed batch (${updateTxs.length} cities enriched)`);
          updateTxs.length = 0;
        } catch (error) {
          console.error(`    ✗ Error updating batch:`, error.message);
          updateTxs.length = 0;
        }
      }
    }
  }
  
  console.log(`\n✅ MSA enrichment complete!`);
  console.log(`   - Enriched: ${enrichedCount} cities`);
  console.log(`   - Skipped: ${skippedCount} cities (already enriched or no mapping found)`);
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const limitIndex = args.findIndex(arg => arg === '--limit' || arg === '-l');
  const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : null;
  
  enrichMSA(limit).catch(error => {
    console.error('\n✗ Error enriching MSA data:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { enrichMSA, getMSAData };
