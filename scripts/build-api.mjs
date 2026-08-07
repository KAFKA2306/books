import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './load-catalog.mjs';

const root = process.cwd();
const outDir = path.join(root, 'api', 'v1');
const catalog = await loadCatalog(root);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function json(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = Array.isArray(value) ? value.join('|') : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, fields) {
  return `${fields.join(',')}\n${rows.map((row) => fields.map((field) => csvCell(row[field])).join(',')).join('\n')}\n`;
}

await fs.mkdir(outDir, { recursive: true });
const distributions = {
  'catalog.json': json(catalog),
  'works.json': json(catalog.works),
  'editions.json': json(catalog.editions),
  'holdings.json': json(catalog.holdings),
  'works.csv': toCsv(catalog.works, ['work_id','title','title_key','author','category','status','progress','rating','price_yen','acquired_at','item_count','isbn_count','isbn_status','sources','formats']),
  'editions.csv': toCsv(catalog.editions, ['edition_id','id_kind','work_id','isbn13','isbn10','language','publisher','published_year','format','verification']),
  'holdings.csv': toCsv(catalog.holdings, ['holding_id','work_id','edition_id','source','format','quantity','acquired_at','price_yen','progress','rating']),
};

const files = [];
for (const [name, content] of Object.entries(distributions)) {
  await fs.writeFile(path.join(outDir, name), content);
  files.push({ name, bytes: Buffer.byteLength(content), sha256: sha256(content) });
}

const manifest = {
  schema: 'kafka.books.api-manifest.v1',
  api_version: 'v1',
  source_schema_version: catalog.schema_version,
  source_generated_at: catalog.generated_at,
  generated_from: [
    'data/catalog.parts.json',
    'data/issue-1-books.parts.json',
    'data/isbn-enrichments.json',
  ],
  license: 'Repository license and source-specific terms apply',
  record_counts: {
    works: catalog.works.length,
    editions: catalog.editions.length,
    holdings: catalog.holdings.length,
  },
  cache: { max_age_seconds: 3600, validation: 'sha256' },
  files,
};
await fs.writeFile(path.join(outDir, 'manifest.json'), json(manifest));
console.log(JSON.stringify(manifest.record_counts));
