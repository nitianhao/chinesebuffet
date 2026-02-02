import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
console.log(`[env.local] absolute path: ${envPath}`);
console.log(`[env.local] exists: ${fs.existsSync(envPath)}`);

const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const lines = envText.split(/\r?\n/);

const matchingLines = lines.filter((l) => /^GOOGLE_MAPS_API_KEY\s*=/.test(l));
console.log(`[env.local] matching lines count: ${matchingLines.length}`);
matchingLines.forEach((l, i) => console.log(`[env.local] line ${i + 1}: ${l}`));

function fingerprint(k) {
  if (!k) return "MISSING";
  return `${k.slice(0, 6)}...${k.slice(-4)} (len=${k.length})`;
}

const match = envText.match(/^GOOGLE_MAPS_API_KEY\s*=\s*(.+)\s*$/m);
let raw = match?.[1] ?? "";
raw = raw.trim();
if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
  raw = raw.slice(1, -1);
}
console.log(`[env.local] fingerprint: ${fingerprint(raw)}`);
