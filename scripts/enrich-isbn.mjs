import fs from 'node:fs/promises';
import path from 'node:path';
import { loadCatalog } from './load-catalog.mjs';
import {
  consolidateCandidates,
  eligibleWorks,
  parseGoogleBooks,
  parseNdlOpenSearch,
  parseOpenBd,
  retryAfter,
} from '../src/isbn-enrichment.mjs';

const root = process.cwd();
const overlayPath = path.join(root, 'data/isbn-enrichments.json');
const statePath = path.join(root, 'data/isbn-enrichment-state.json');
const reportPath = path.join(root, 'data/isbn-enrichment-report.json');
const args = parseArgs(process.argv.slice(2));
const now = new Date();
const nowIso = now.toISOString();
const providerRequestAttempts = 2;
const providerRequestTimeoutMs = 15_000;

const catalog = await loadCatalog(root);
const overlay = await readJson(overlayPath, {
  schema: 'kafka.books.isbn-enrichments.v1',
  updated_at: null,
  records: [],
});
const state = await readJson(statePath, {
  schema: 'kafka.books.isbn-enrichment-state.v1',
  updated_at: null,
  attempts: {},
});
const selected = eligibleWorks(catalog, state, now).slice(0, args.limit);

if (!selected.length) {
  console.log(JSON.stringify({ attempted: 0, enriched: 0, reason: 'no_due_works' }));
  process.exit(0);
}

const processed = await mapWithConcurrency(selected, args.concurrency, async ({ work, pending_edition: pendingEdition }) => {
  const providerErrors = [];
  const candidates = [];
  const initialLookups = await Promise.allSettled([
    searchNdl(work.title),
    searchGoogleBooks(work.title),
  ]);

  for (const [index, lookup] of initialLookups.entries()) {
    const provider = index === 0 ? 'ndl' : 'google_books';
    if (lookup.status === 'fulfilled') candidates.push(...lookup.value);
    else providerErrors.push({ provider, message: errorMessage(lookup.reason) });
  }

  const candidateIsbns = [...new Set(candidates.map((candidate) => candidate.isbn13))]
    .slice(0, 20);
  if (candidateIsbns.length) {
    try {
      candidates.push(...await lookupOpenBd(candidateIsbns));
    } catch (error) {
      providerErrors.push({ provider: 'openbd', message: errorMessage(error) });
    }
  }

  const decision = consolidateCandidates(work, candidates);
  let outcome = decision.outcome;
  if (!candidates.length && providerErrors.length) outcome = 'provider_error';
  else if (!candidates.length) outcome = 'no_candidate';
  else if (outcome === 'no_consensus' && providerErrors.length >= 2) outcome = 'provider_error';

  const result = {
    work_id: work.work_id,
    title: work.title,
    outcome,
    accepted_isbn13: decision.accepted?.isbn13 ?? null,
    candidates: decision.candidates,
    provider_errors: providerErrors,
  };
  console.log(JSON.stringify({
    work_id: work.work_id,
    outcome,
    candidate_count: decision.candidates.length,
    provider_error_count: providerErrors.length,
  }));

  return {
    result,
    accepted: outcome === 'accepted' ? {
      ...decision.accepted,
      replaces_edition_id: pendingEdition.edition_id,
      verified_at: nowIso,
    } : null,
    stateAttempt: {
      attempted_at: nowIso,
      outcome,
      next_attempt_at: retryAfter(outcome, now),
      candidate_count: decision.candidates.length,
      provider_errors: providerErrors,
    },
  };
});

const results = processed.map((item) => item.result);
for (const item of processed) {
  if (item.accepted) overlay.records.push(item.accepted);
  state.attempts[item.result.work_id] = item.stateAttempt;
}

const enriched = results.filter((result) => result.outcome === 'accepted').length;
overlay.records.sort((left, right) => left.work_id.localeCompare(right.work_id));
overlay.updated_at = nowIso;
state.updated_at = nowIso;
state.total_attempts = Object.keys(state.attempts).length;
const report = {
  schema: 'kafka.books.isbn-enrichment-report.v1',
  generated_at: nowIso,
  policy: {
    batch_limit: args.limit,
    concurrency: args.concurrency,
    minimum_distinct_providers: 2,
    title_similarity_threshold: 0.95,
    ambiguous_candidates_are_rejected: true,
    provider_request_attempts: providerRequestAttempts,
    provider_request_timeout_ms: providerRequestTimeoutMs,
  },
  summary: {
    attempted: results.length,
    enriched,
    ambiguous: results.filter((result) => result.outcome === 'ambiguous').length,
    no_consensus: results.filter((result) => result.outcome === 'no_consensus').length,
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
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('--limit must be an integer from 1 to 100');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) {
    throw new Error('--concurrency must be an integer from 1 to 10');
  }
  return { limit, concurrency, dryRun };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker(),
  ));
  return results;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
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

async function searchNdl(title) {
  const url = new URL('https://ndlsearch.ndl.go.jp/api/opensearch');
  url.search = new URLSearchParams({
    cnt: '20',
    title,
    dpid: 'iss-ndl-opac-national',
  });
  return parseNdlOpenSearch(await fetchText(url, 'ndl'));
}

async function searchGoogleBooks(title) {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  const params = new URLSearchParams({
    q: `intitle:"${title}"`,
    maxResults: '10',
    printType: 'books',
    projection: 'lite',
  });
  if (process.env.GOOGLE_BOOKS_API_KEY) params.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  url.search = params;
  return parseGoogleBooks(await fetchJson(url, 'google_books'));
}

async function lookupOpenBd(isbns) {
  const url = new URL('https://api.openbd.jp/v1/get');
  url.search = new URLSearchParams({ isbn: isbns.join(',') });
  return parseOpenBd(await fetchJson(url, 'openbd'));
}

async function fetchJson(url, provider) {
  return JSON.parse(await fetchText(url, provider));
}

async function fetchText(url, provider) {
  let lastError;
  for (let attempt = 1; attempt <= providerRequestAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), providerRequestTimeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'KAFKA2306-books-isbn-enrichment/1.1 (+https://github.com/KAFKA2306/books)',
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${provider} returned HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < providerRequestAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${provider} request failed: ${errorMessage(lastError)}`);
}
