import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './load-catalog.mjs';
import { normalizeCatalogSources, normalizeIssueRecords } from '../src/source-groups.mjs';

const root = process.cwd();
const outDir = path.join(root, 'api', 'v1');
const catalog = normalizeCatalogSources(await loadCatalog(root));

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
  const text = typeof value === 'object' ? JSON.stringify(stable(value)) : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizeCsvRows(rows) {
  if (rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) return rows;
  return rows.map((value) => ({ value }));
}

function csvFields(rows) {
  const fields = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      fields.push(key);
    }
  }
  return fields.length ? fields : ['value'];
}

function toCsv(rawRows) {
  const rows = normalizeCsvRows(rawRows);
  const fields = csvFields(rows);
  return `${fields.join(',')}\n${rows.map((row) => fields.map((field) => csvCell(row[field])).join(',')).join('\n')}\n`;
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
}

const issueData = await readJson('data/issue-1-books.json');
const isbnEnrichments = await readJson('data/isbn-enrichments.json');
const isbnEnrichmentState = await readJson('data/isbn-enrichment-state.json');
const isbnEnrichmentReport = await readJson('data/isbn-enrichment-report.json');
const classificationState = await readJson('data/classification-state.json');
const classificationReport = await readJson('data/classification-report.json');

const canonicalCollections = Object.fromEntries(
  Object.entries(catalog).filter(([, value]) => Array.isArray(value)),
);

const supplementalCollections = {
  issue_records: normalizeIssueRecords(issueData.records ?? []),
  isbn_enrichments: isbnEnrichments.records ?? [],
  isbn_enrichment_attempts: Object.entries(isbnEnrichmentState.attempts ?? {}).map(
    ([work_id, attempt]) => ({ work_id, ...attempt }),
  ),
  isbn_enrichment_results: isbnEnrichmentReport.results ?? [],
  classification_attempts: Object.entries(classificationState.attempts ?? {}).map(
    ([edition_id, attempt]) => ({ edition_id, ...attempt }),
  ),
  classification_results: classificationReport.results ?? [],
};

const collections = {
  ...canonicalCollections,
  ...supplementalCollections,
};

const collectionIndex = Object.entries(collections).map(([name, rows]) => ({
  name,
  kind: Object.hasOwn(canonicalCollections, name) ? 'canonical' : 'supplemental',
  count: rows.length,
  json: `${name}.json`,
  csv: `${name}.csv`,
}));

await fs.mkdir(outDir, { recursive: true });
const distributions = {
  'catalog.json': json(catalog),
  'collections.json': json({
    schema: 'kafka.books.api-collections.v1',
    api_version: 'v1',
    collections: collectionIndex,
  }),
};

for (const [name, rows] of Object.entries(collections)) {
  distributions[`${name}.json`] = json(rows);
  distributions[`${name}.csv`] = toCsv(rows);
}

const files = [];
for (const [name, content] of Object.entries(distributions)) {
  await fs.writeFile(path.join(outDir, name), content);
  files.push({ name, bytes: Buffer.byteLength(content), sha256: sha256(content) });
}

const recordCounts = Object.fromEntries(
  Object.entries(collections).map(([name, rows]) => [name, rows.length]),
);

const manifest = {
  schema: 'kafka.books.api-manifest.v1',
  api_version: 'v1',
  source_schema_version: catalog.schema_version,
  source_generated_at: catalog.generated_at,
  generated_from: [
    'data/catalog.json',
    'data/issue-1-books.json',
    'data/isbn-enrichments.json',
    'data/isbn-enrichment-state.json',
    'data/isbn-enrichment-report.json',
    'data/classifications.json',
    'data/classification-state.json',
    'data/classification-report.json',
  ],
  license: 'Repository license and source-specific terms apply',
  collection_index: 'collections.json',
  record_counts: recordCounts,
  cache: { max_age_seconds: 3600, validation: 'sha256' },
  files,
};
await fs.writeFile(path.join(outDir, 'manifest.json'), json(manifest));
console.log(JSON.stringify(manifest.record_counts));
