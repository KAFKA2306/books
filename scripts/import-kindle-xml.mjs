import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  KINDLE_PART_SIZE,
  kindleOriginCounts,
  parseKindleMetadataXml,
  sha256,
} from '../src/kindle-metadata.mjs';
import { dedupeKindleRecords } from '../src/kindle-storage.mjs';

function defaultKindleXmlPath() {
  if (process.env.KINDLE_XML_PATH) return process.env.KINDLE_XML_PATH;
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Amazon', 'Kindle', 'Cache', 'KindleSyncMetadataCache.xml');
  }
  return null;
}

function parseArgs(argv) {
  const options = { input: null, partSize: KINDLE_PART_SIZE };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--part-size') {
      options.partSize = Number(argv[++index]);
    } else if (!options.input) {
      options.input = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!Number.isInteger(options.partSize) || options.partSize < 1) {
    throw new Error('--part-size must be a positive integer');
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const inputCandidate = options.input ?? defaultKindleXmlPath();
if (!inputCandidate) {
  throw new Error('Kindle XML path is required. Pass it as the first argument or set KINDLE_XML_PATH.');
}
const inputPath = path.resolve(inputCandidate);

const sourceBuffer = await fs.readFile(inputPath);
const sourceText = sourceBuffer.toString('utf8');
const parsed = parseKindleMetadataXml(sourceText);
const records = dedupeKindleRecords(parsed.records);
const dataDir = path.join(process.cwd(), 'data', 'kindle');
await fs.mkdir(dataDir, { recursive: true });

const existing = await fs.readdir(dataDir).catch(() => []);
await Promise.all(
  existing
    .filter((name) => /^records-\d+\.ndjson$/.test(name))
    .map((name) => fs.rm(path.join(dataDir, name))),
);

const parts = [];
for (let offset = 0, partNumber = 1; offset < records.length; offset += options.partSize, partNumber += 1) {
  const rows = records.slice(offset, offset + options.partSize);
  const content = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  const name = `records-${String(partNumber).padStart(2, '0')}.ndjson`;
  await fs.writeFile(path.join(dataDir, name), content, 'utf8');
  parts.push({
    name,
    records: rows.length,
    bytes: Buffer.byteLength(content),
    sha256: sha256(content),
  });
}

const manifest = {
  schema: 'kafka.books.kindle-metadata.v1',
  source_file: path.basename(inputPath),
  source_sha256: crypto.createHash('sha256').update(sourceBuffer).digest('hex'),
  sync_time: parsed.sync_time,
  source_software_version: parsed.source_software_version,
  raw_record_count: parsed.records.length,
  record_count: records.length,
  unique_asin_count: new Set(records.map((record) => record.asin)).size,
  origin_counts: kindleOriginCounts(records),
  parts,
};

await fs.writeFile(
  path.join(dataDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify({
  input: inputPath,
  raw_records: manifest.raw_record_count,
  records: manifest.record_count,
  exact_duplicates_removed: manifest.raw_record_count - manifest.record_count,
  unique_asins: manifest.unique_asin_count,
  origins: manifest.origin_counts,
  parts: manifest.parts.length,
}, null, 2));