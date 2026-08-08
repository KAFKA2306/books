import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './load-catalog.mjs';
import { ndc10MainClass, parseNdlClassifications } from '../src/classification.mjs';

const root = process.cwd();
const overlayPath = path.join(root, 'data/classifications.json');
const statePath = path.join(root, 'data/classification-state.json');
const reportPath = path.join(root, 'data/classification-report.json');
const args = parseArgs(process.argv.slice(2));
const now = new Date();
const nowIso = now.toISOString();
const requestAttempts = 2;
const requestTimeoutMs = 15_000;

const catalog = await loadCatalog(root);
const overlay = await readJson(overlayPath);
const state = await readJson(statePath, {
  schema: 'kafka.books.classification-state.v1',
  updated_at: null,
  attempts: {},
});

const existingByEdition = new Set((overlay.records ?? []).map((row) => row.edition_id).filter(Boolean));
const eligible = catalog.editions
  .filter((edition) => edition.isbn13 && !existingByEdition.has(edition.edition_id))
  .filter((edition) => {
    const next = state.attempts?.[edition.edition_id]?.next_attempt_at;
    return !next || new Date(next) <= now;
  })
  .sort((a, b) => a.edition_id.localeCompare(b.edition_id))
  .slice(0, args.limit);

if (!eligible.length) {
  console.log(JSON.stringify({ attempted: 0, enriched_editions: 0, reason: 'no_due_editions' }));
  process.exit(0);
}

const processed = await mapWithConcurrency(eligible, args.concurrency, async (edition) => {
  const url = new URL('https://ndlsearch.ndl.go.jp/api/opensearch');
  url.search = new URLSearchParams({ cnt: '10', isbn: edition.isbn13, dpid: 'iss-ndl-opac' });

  try {
    const xml = await fetchText(url);
    const found = parseNdlClassifications(xml);
    const records = found.map((entry) => {
      const main = entry.scheme_id === 'ndc10'
        ? ndc10MainClass(entry.code, overlay.ndc10_main_classes ?? [])
        : null;
      return {
        classification_id: `cls:${edition.edition_id}:${entry.scheme_id}:${entry.code}`,
        work_id: edition.work_id,
        edition_id: edition.edition_id,
        scheme_id: entry.scheme_id,
        code: entry.code,
        uri: entry.uri,
        main_class_code: main?.code ?? null,
        main_class_label: main?.label ?? null,
        source_provider: 'ndl_search',
        source_isbn13: edition.isbn13,
        source_url: url.toString(),
        verification: 'source_reported',
        verified_at: nowIso,
      };
    });
    const outcome = records.length ? 'accepted' : 'no_classification';
    return { edition, records, outcome, error: null };
  } catch (error) {
    return { edition, records: [], outcome: 'provider_error', error: errorMessage(error) };
  }
});

for (const item of processed) {
  if (item.records.length) overlay.records.push(...item.records);
  state.attempts[item.edition.edition_id] = {
    attempted_at: nowIso,
    outcome: item.outcome,
    next_attempt_at: retryAfter(item.outcome, now),
    error: item.error,
  };
}

overlay.records = dedupeRecords(overlay.records ?? []);
overlay.updated_at = nowIso;
state.updated_at = nowIso;
state.total_attempts = Object.keys(state.attempts ?? {}).length;

const report = {
  schema: 'kafka.books.classification-report.v1',
  generated_at: nowIso,
  policy: {
    primary_scheme: 'ndc10',
    source: 'NDL Search OpenSearch',
    exact_isbn_lookup: true,
    ndc9_to_ndc10_conversion: false,
    request_attempts: requestAttempts,
    request_timeout_ms: requestTimeoutMs,
    batch_limit: args.limit,
    concurrency: args.concurrency,
  },
  summary: {
    attempted: processed.length,
    enriched_editions: processed.filter((item) => item.records.length).length,
    classification_records_added: processed.reduce((sum, item) => sum + item.records.length, 0),
    ndc10_records_added: processed.flatMap((item) => item.records).filter((row) => row.scheme_id === 'ndc10').length,
    no_classification: processed.filter((item) => item.outcome === 'no_classification').length,
    provider_error: processed.filter((item) => item.outcome === 'provider_error').length,
  },
  results: processed.map((item) => ({
    work_id: item.edition.work_id,
    edition_id: item.edition.edition_id,
    isbn13: item.edition.isbn13,
    outcome: item.outcome,
    classifications: item.records.map(({ scheme_id, code, uri }) => ({ scheme_id, code, uri })),
    error: item.error,
  })),
};

if (!args.dryRun) {
  await Promise.all([
    writeJson(overlayPath, overlay),
    writeJson(statePath, state),
    writeJson(reportPath, report),
  ]);
}

console.log(JSON.stringify(report.summary));

function parseArgs(values) {
  let limit = 25;
  let concurrency = 4;
  let dryRun = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--dry-run') dryRun = true;
    else if (value === '--limit') limit = Number(values[index += 1]);
    else if (value.startsWith('--limit=')) limit = Number(value.slice('--limit='.length));
    else if (value === '--concurrency') concurrency = Number(values[index += 1]);
    else if (value.startsWith('--concurrency=')) concurrency = Number(value.slice('--concurrency='.length));
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('--limit must be 1..100');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) throw new Error('--concurrency must be 1..10');
  return { limit, concurrency, dryRun };
}

function retryAfter(outcome, base) {
  if (outcome === 'accepted') return null;
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + (outcome === 'provider_error' ? 1 : 90));
  return next.toISOString();
}

function dedupeRecords(records) {
  const map = new Map();
  for (const row of records) map.set(`${row.edition_id}\t${row.scheme_id}\t${row.code}`, row);
  return [...map.values()].sort((a, b) => a.classification_id.localeCompare(b.classification_id));
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'KAFKA2306-books-classification/1.0 (+https://github.com/KAFKA2306/books)' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`NDL Search returned HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < requestAttempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`NDL Search request failed: ${errorMessage(lastError)}`);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== null) return structuredClone(fallback);
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
