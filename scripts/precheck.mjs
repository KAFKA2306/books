import fs from 'node:fs/promises';
import { loadCatalog } from './load-catalog.mjs';
import { precheckCandidates } from '../src/catalog.mjs';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npm run catalog:precheck -- <input.json>');
  process.exit(2);
}
const candidates = JSON.parse(await fs.readFile(inputPath, 'utf8'));
if (!Array.isArray(candidates)) throw new TypeError('Input must be a JSON array');
const catalog = await loadCatalog();
const result = precheckCandidates(candidates, catalog);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
