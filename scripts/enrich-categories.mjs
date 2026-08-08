import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './load-catalog.mjs';
import {
  CATEGORY_RULE_VERSION,
  categoryRetryAfter,
  decideCategory,
  eligibleCategoryWorks,
  parseNdlCategorySearch,
} from '../src/category-enrichment.mjs';

const root = process.cwd();
const overlayPath = path.join(root, 'data/category-enrichments.json');
const statePath = path.join(root, 'data/category-enrichment-state.json');
const reportPath = path.join(root, 'data/category-enrichment-report.json');
const args = parseArgs(process.argv.slice(2));
const now = new Date();
const nowIso = now.toISOString();
const requestTimeoutMs = 15_000;
const requestAttempts = 2;
const requestIntervalMs = 350;

const catalog = await loadCatalog(root);
const overlay = await readJson(overlayPath, {
  schema: 'kafka.books.category-enrichments.v1',
  rule_version: CATEGORY_RULE_VERSION,
  updated_at: null,
  records: [],
});
const state = await readJson(statePath, {
  schema: 'kafka.books.category-enrichment-state.v1',
  rule_version: CATEGORY_RULE_VERSION,
  updated_at: null,
  attempts: {},
});

if (overlay.rule_version !== CATEGORY_RULE_VERSION) {
  throw new Error(`category overlay rule version mismatch: ${overlay.rule_version}`);
}
if (state.rule_version !== CATEGORY_RULE_VERSION) {
  throw new Error(`category state rule version mismatch: ${state.rule_version}`);
}

const editionsByWork = new Map();
for (const edition of catalog.editions) {
  const list = editionsByWork.get(edition.work_id) ?? [];
  list.push(edition);
  editionsByWork.set(edition.work_id, list);
}

const selected = eligibleCategoryWorks(catalog, state, now).slice(0, args.limit);
const results = [];
const acceptedByWork = new Map(overlay.records.map((record) => [record.work_id, record]));

for (let index = 0; index < selected.length; index += 1) {
  const work = selected[index];
  const editions = editionsByWork.get(work.work_id) ?? [];
  const isbn13s = [...new Set(editions
    .filter((edition) => edition.verification === 'verified' && edition.isbn13)
    .map((edition) => edition.isbn13))]
    .sort();

  let outcome;
  let decision = null;
  let providerError = null;
  try {
    let records = [];
    if (isbn13s.length) {
      records = await searchNdl({ isbn: isbn13s[0] });
      if (!records.length) records = await searchNdl({ title: work.title });
    } else {
      records = await searchNdl({ title: work.title });
    }
    decision = decideCategory(work, records, { isbn13s });
    outcome = decision.outcome;
  } catch (error) {
    outcome = 'provider_error';
    providerError = errorMessage(error);
  }

  const result = {
    work_id: work.work_id,
    title: work.title,
    outcome,
    category: decision?.accepted?.category ?? null,
    ndc_code: decision?.accepted?.ndc_code ?? null,
    match_mode: decision?.accepted?.match_mode ?? null,
    matches: decision?.matches ?? 0,
    provider_error: providerError,
  };
  results.push(result);

  if (outcome === 'accepted') {
    acceptedByWork.set(work.work_id, {
      work_id: work.work_id,
      ...decision.accepted,
      verified_at: nowIso,
    });
  }
  state.attempts[work.work_id] = {
    attempted_at: nowIso,
    outcome,
    next_attempt_at: categoryRetryAfter(outcome, now),
    category: decision?.accepted?.category ?? null,
    ndc_code: decision?.accepted?.ndc_code ?? null,
    provider_error: providerError,
  };

  console.log(JSON.stringify({
    index: index + 1,
    total: selected.length,
    work_id: work.work_id,
    outcome,
    category: decision?.accepted?.category ?? null,
    ndc_code: decision?.accepted?.ndc_code ?? null,
    provider_error: providerError,
  }));
  if (index + 1 < selected.length) await sleep(requestIntervalMs);
}

overlay.records = [...acceptedByWork.values()].sort((left, right) => left.work_id.localeCompare(right.work_id));
overlay.updated_at = nowIso;
state.updated_at = nowIso;
state.total_attempts = Object.keys(state.attempts).length;

const report = {
  schema: 'kafka.books.category-enrichment-report.v1',
  generated_at: nowIso,
  rule_version: CATEGORY_RULE_VERSION,
  policy: {
    source: 'National Diet Library Search OpenSearch API',
    source_endpoint: 'https://ndlsearch.ndl.go.jp/api/opensearch',
    category_source: 'NDC classification mapped by explicit deterministic rules',
    isbn_match_preferred: true,
    title_similarity_threshold: 0.97,
    ambiguous_categories_are_rejected: true,
    request_concurrency: 1,
    request_interval_ms: requestIntervalMs,
    request_attempts: requestAttempts,
    request_timeout_ms: requestTimeoutMs,
  },
  summary: {
    attempted: results.length,
    accepted: results.filter((result) => result.outcome === 'accepted').length,
    ambiguous: results.filter((result) => result.outcome === 'ambiguous').length,
    no_ndc: results.filter((result) => result.outcome === 'no_ndc').length,
    no_candidate: results.filter((result) => result.outcome === 'no_candidate').length,
    provider_error: results.filter((result) => result.outcome === 'provider_error').length,
  },
  results,
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
  let limit = 100;
  let dryRun = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--dry-run') dryRun = true;
    else if (value === '--limit') limit = Number(values[index += 1]);
    else if (value.startsWith('--limit=')) limit = Number(value.slice('--limit='.length));
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('--limit must be an integer from 1 to 500');
  }
  return { limit, dryRun };
}

async function searchNdl({ isbn = null, title = null }) {
  const url = new URL('https://ndlsearch.ndl.go.jp/api/opensearch');
  const params = new URLSearchParams({ cnt: '20', dpid: 'iss-ndl-opac-national' });
  if (isbn) params.set('isbn', isbn);
  else if (title) params.set('title', title);
  else throw new Error('NDL search requires isbn or title');
  url.search = params;
  return parseNdlCategorySearch(await fetchText(url));
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= requestAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'KAFKA2306-books-category-enrichment/1.0 (+https://github.com/KAFKA2306/books)',
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`ndl returned HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < requestAttempts) await sleep(attempt * 1_000);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`ndl request failed: ${errorMessage(lastError)}`);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(fallback);
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
