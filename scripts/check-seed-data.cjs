// Validate editable data without a DB connection. Build once before first use.
require('dotenv/config');
const {
  loadSeedData,
  seedDataDirectory,
} = require('../dist/src/seed-db/seed-data.loader.js');

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--base-only'))
    throw new Error('Usage: node scripts/check-seed-data.cjs [--base-only]');
  const dataset = loadSeedData({ includeDemo: !args.includes('--base-only') });
  console.log(`Valid seed JSON: ${seedDataDirectory()}`);
  for (const [name, rows] of Object.entries({
    ...dataset.base,
    ...dataset.demo,
  }))
    console.log(`${name}: ${rows.length}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
