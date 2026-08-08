import fs from 'node:fs/promises';
import path from 'node:path';
import { buildKindleSnapshot, parseKindleMetadataText } from '../src/kindle-import.mjs';
import { writeKindleMetadata } from '../src/kindle-storage.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((arg) => arg !== '--dry-run');
const inputPath = positional[0];
const outputDir = positional[1] ?? path.join(process.cwd(), 'data', 'kindle');

if (!inputPath) {
  console.error('usage: node scripts/import-kindle-xml.mjs <KindleSyncMetadataCache.xml> [output-directory] [--dry-run]');
  process.exit(2);
}

const text = await fs.readFile(inputPath, 'utf8');
const parsed = parseKindleMetadataText(text);
const snapshot = buildKindleSnapshot(parsed);
const counts = {
  raw_records: parsed.raw_record_count,
  records: parsed.record_count,
  items: snapshot.items.length,
  acquisitions: snapshot.acquisitions.length,
  purchase: snapshot.acquisitions.filter((row) => row.acquisition_type === 'purchase').length,
  prime: snapshot.acquisitions.filter((row) => row.acquisition_type === 'prime').length,
  sample: snapshot.acquisitions.filter((row) => row.acquisition_type === 'sample').length,
  catalog_items: snapshot.items.filter((row) => row.catalog_eligible).length,
};

const manifest = dryRun ? null : await writeKindleMetadata(parsed, outputDir);
console.log(JSON.stringify({ source_sync_time: parsed.source_sync_time, output: dryRun ? null : outputDir, parts: manifest?.parts ?? [], counts }, null, 2));
