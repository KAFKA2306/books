import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog, loadIsbnOverlay } from './load-catalog.mjs';
import { normalizeCatalogSources, normalizeIssueRecords } from '../src/source-groups.mjs';
import { normalizeBibliographicDisplayCatalog } from '../src/bibliographic-display-normalization.mjs';
import { auditMigrationIdentityEvidence } from '../src/migration-identity-evidence-audit.mjs';
import { auditHoldingDuplicates } from '../src/holding-duplicate-audit.mjs';

const root = process.cwd();
const outDir = path.join(root, 'api', 'v1');
const rawCatalog = await loadCatalog(root);
const holdingDuplicateAudit = auditHoldingDuplicates(rawCatalog.holdings);
const catalog = normalizeBibliographicDisplayCatalog(
  normalizeCatalogSources(rawCatalog),
);
const migrationIdentityEvidenceAudit = auditMigrationIdentityEvidence(catalog.works);

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
const migrationIssue1Benchmark = await readJson('data/benchmarks/migration-issue-1-cohort.json');
const isbnEnrichments = await loadIsbnOverlay(root);
const isbnEnrichmentState = await readJson('data/isbn-enrichment-state.json');
const isbnEnrichmentReport = await readJson('data/isbn-enrichment-report.json');
const categoryEnrichments = await readJson('data/category-enrichments.json');
const categoryEnrichmentState = await readJson('data/category-enrichment-state.json');
const categoryEnrichmentReport = await readJson('data/category-enrichment-report.json');

const canonicalCollections = Object.fromEntries(
  Object.entries(catalog).filter(([, value]) => Array.isArray(value)),
);

const supplementalCollections = {
  issue_records: normalizeIssueRecords(issueData.records ?? []),
  migration_issue_1_benchmark: [migrationIssue1Benchmark],
  isbn_enrichments: isbnEnrichments.records ?? [],
  isbn_enrichment_attempts: Object.entries(isbnEnrichmentState.attempts ?? {}).map(
    ([work_id, attempt]) => ({ work_id, ...attempt }),
  ),
  isbn_enrichment_results: isbnEnrichmentReport.results ?? [],
  category_enrichments: categoryEnrichments.records ?? [],
  category_enrichment_attempts: Object.entries(categoryEnrichmentState.attempts ?? {}).map(
    ([work_id, attempt]) => ({ work_id, ...attempt }),
  ),
  category_enrichment_results: categoryEnrichmentReport.results ?? [],
  migration_identity_evidence_audit: [{
    schema: migrationIdentityEvidenceAudit.schema,
    identity_model: migrationIdentityEvidenceAudit.identity_model,
    standard_url: migrationIdentityEvidenceAudit.standard_url,
    ...migrationIdentityEvidenceAudit.summary,
  }],
  migration_identity_evidence_groups: migrationIdentityEvidenceAudit.groups,
  holding_duplicate_audit: [{
    schema: holdingDuplicateAudit.schema,
    standard_url: 'https://repository.ifla.org/bitstreams/7d23aa55-1f85-490f-b500-6170285585a6/download',
    ...holdingDuplicateAudit.summary,
  }],
  holding_duplicate_candidates: holdingDuplicateAudit.candidates,
  holding_duplicate_conflicts: holdingDuplicateAudit.conflicts,
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
  data_as_of: catalog.generated_at,
  generated_at: catalog.generated_at,
  generated_from: [
    'data/catalog.json',
    'data/issue-1-books.json',
    'data/benchmarks/migration-issue-1-cohort.json',
    'data/isbn-enrichments.json',
    'data/isbn-primary-verifications/',
    'data/isbn-enrichment-state.json',
    'data/isbn-enrichment-report.json',
    'data/category-enrichments.json',
    'data/category-enrichment-state.json',
    'data/category-enrichment-report.json',
    'data/work-identities/',
  ],
  license: 'Repository license and source-specific terms apply',
  collection_index: 'collections.json',
  record_counts: recordCounts,
  cache: { max_age_seconds: 3600, validation: 'sha256' },
  files,
};
await fs.writeFile(path.join(outDir, 'manifest.json'), json(manifest));
console.log(JSON.stringify(manifest.record_counts));
