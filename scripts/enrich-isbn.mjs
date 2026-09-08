import fs from 'node:fs/promises';
import path from 'node:path';
import { diceSimilarity } from '../src/catalog.mjs';
import { loadCatalog } from './load-catalog.mjs';
import { retryAfterMilliseconds } from '../src/http-retry.mjs';
import {
  consolidateCandidates,
  eligibleWorks,
  parseGoogleBooks,
  parseNdlSru,
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
const ndlBatchSize = 5;
const openBdBatchSize = 50;
const ndlStrategyVersion = 'sru-title-batch-v2';
const titleSimilarityThreshold = 0.95;
const googleBooksApiKey = process.env.GOOGLE_BOOKS_API_KEY?.trim() || null;

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
const eligibilityState = withCandidatesDueAfterStrategyChange(state);
const selected = eligibleWorks(catalog, eligibilityState, now).slice(0, args.limit);

if (!selected.length) {
  console.log(JSON.stringify({ attempted: 0, enriched: 0, reason: 'no_due_works' }));
  process.exit(0);
}

const ndlCandidatesByWork = new Map(selected.map(({ work }) => [work.work_id, []]));
const ndlErrorByWork = new Map();
let ndlLogicalRequests = 0;

for (const batch of chunks(selected, ndlBatchSize)) {
  ndlLogicalRequests += 1;
  try {
    const batchCandidates = await searchNdlBatch(batch.map(({ work }) => work.title));
    for (const { work } of batch) {
      ndlCandidatesByWork.set(
        work.work_id,
        batchCandidates.filter((candidate) => (
          candidate?.title
          && isNdlCandidateTitleMatch(work.title, candidate.title)
        )),
      );
    }
  } catch (error) {
    const message = errorMessage(error);
    for (const { work } of batch) ndlErrorByWork.set(work.work_id, message);
  }
}

const ndlIsbns = [...new Set(
  [...ndlCandidatesByWork.values()].flat().map((candidate) => candidate.isbn13).filter(Boolean),
)];
const openBdCandidatesByIsbn = new Map();
const openBdErrorByIsbn = new Map();
let openBdLogicalRequests = 0;

for (const isbnBatch of chunks(ndlIsbns, openBdBatchSize)) {
  openBdLogicalRequests += 1;
  try {
    for (const candidate of await lookupOpenBd(isbnBatch)) {
      const current = openBdCandidatesByIsbn.get(candidate.isbn13) ?? [];
      current.push(candidate);
      openBdCandidatesByIsbn.set(candidate.isbn13, current);
    }
  } catch (error) {
    const message = errorMessage(error);
    for (const isbn13 of isbnBatch) openBdErrorByIsbn.set(isbn13, message);
  }
}

const processed = await mapWithConcurrency(selected, args.concurrency, async ({ work, pending_edition: pendingEdition }) => {
  const providerErrors = [];
  const ndlCandidates = ndlCandidatesByWork.get(work.work_id) ?? [];
  const candidates = [...ndlCandidates];
  const ndlError = ndlErrorByWork.get(work.work_id);
  if (ndlError) providerErrors.push({ provider: 'ndl', message: ndlError });

  if (googleBooksApiKey) {
    try {
      candidates.push(...await searchGoogleBooks(work.title, googleBooksApiKey));
    } catch (error) {
      providerErrors.push({ provider: 'google_books', message: errorMessage(error) });
    }
  }

  const relevantIsbns = [...new Set(ndlCandidates.map((candidate) => candidate.isbn13).filter(Boolean))];
  const openBdErrors = new Set();
  for (const isbn13 of relevantIsbns) {
    candidates.push(...(openBdCandidatesByIsbn.get(isbn13) ?? []));
    const openBdError = openBdErrorByIsbn.get(isbn13);
    if (openBdError) openBdErrors.add(openBdError);
  }
  for (const message of openBdErrors) providerErrors.push({ provider: 'openbd', message });

  const providerCandidateCounts = countCandidatesByProvider(candidates);
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
    provider_candidate_counts: providerCandidateCounts,
    provider_errors: providerErrors,
  };
  console.log(JSON.stringify({
    work_id: work.work_id,
    outcome,
    candidate_count: decision.candidates.length,
    provider_candidate_counts: providerCandidateCounts,
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
      provider_strategy: ndlStrategyVersion,
    },
  };
});

const results = processed.map((item) => item.result);
for (const item of processed) {
  if (item.accepted) overlay.records.push(item.accepted);
  state.attempts[item.result.work_id] = item.stateAttempt;
}

const enriched = results.filter((result) => result.outcome === 'accepted').length;
if (enriched > 0) {
  overlay.records.sort((left, right) => left.work_id.localeCompare(right.work_id));
  overlay.updated_at = nowIso;
}
state.updated_at = nowIso;
state.total_attempts = Object.keys(state.attempts).length;
const report = {
  schema: 'kafka.books.isbn-enrichment-report.v1',
  generated_at: nowIso,
  policy: {
    batch_limit: args.limit,
    concurrency: args.concurrency,
    minimum_distinct_providers: 2,
    title_similarity_threshold: titleSimilarityThreshold,
    ambiguous_candidates_are_rejected: true,
    provider_request_attempts: providerRequestAttempts,
    provider_request_timeout_ms: providerRequestTimeoutMs,
    ndl_query_strategy: ndlStrategyVersion,
    ndl_batch_size: ndlBatchSize,
    google_books_enabled: Boolean(googleBooksApiKey),
  },
  logical_requests: {
    ndl: ndlLogicalRequests,
    openbd: openBdLogicalRequests,
    google_books: googleBooksApiKey ? selected.length : 0,
  },
  summary: {
    attempted: results.length,
    enriched,
    ambiguous: results.filter((result) => result.outcome === 'ambiguous').length,
    no_consensus: results.filter((result) => result.outcome === 'no_consensus').length,
    no_candidate: results.filter((result) => result.outcome === 'no_candidate').length,
    provider_error: results.filter((result) => result.outcome === 'provider_error').length,
  },
  provider_summary: summarizeProviders(results, Boolean(googleBooksApiKey)),
  results,
};

if (!args.dryRun) {
  const writes = [
    writeJson(statePath, state),
    writeJson(reportPath, report),
  ];
  if (enriched > 0) writes.push(writeJson(overlayPath, overlay));
  await Promise.all(writes);
}
console.log(JSON.stringify(report.summary));

function withCandidatesDueAfterStrategyChange(currentState) {
  return {
    ...currentState,
    attempts: Object.fromEntries(Object.entries(currentState.attempts ?? {}).map(([workId, attempt]) => {
      if (
        ['provider_error', 'no_candidate'].includes(attempt?.outcome)
        && attempt?.provider_strategy !== ndlStrategyVersion
      ) {
        return [workId, { ...attempt, next_attempt_at: null }];
      }
      return [workId, attempt];
    })),
  };
}

function isNdlCandidateTitleMatch(workTitle, candidateTitle) {
  const work = normalizeCandidateTitle(workTitle);
  const candidate = normalizeCandidateTitle(candidateTitle);
  return Boolean(work && candidate && (candidate.includes(work) || work.includes(candidate)));
}

function normalizeCandidateTitle(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000:：\-―—・「」『』（）()]/g, '');
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function parseArgs(values) {
  let limit = 25;
  let concurrency = 1;
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

function countCandidatesByProvider(candidates) {
  const counts = {};
  for (const candidate of candidates) {
    const provider = candidate?.provider;
    if (!provider) continue;
    counts[provider] = (counts[provider] ?? 0) + 1;
  }
  return counts;
}

function summarizeProviders(results, googleBooksEnabled) {
  const enabled = { ndl: true, openbd: true, google_books: googleBooksEnabled };
  return Object.fromEntries(Object.entries(enabled).map(([provider, isEnabled]) => {
    const candidateCount = results.reduce(
      (sum, result) => sum + (result.provider_candidate_counts?.[provider] ?? 0),
      0,
    );
    const worksWithCandidates = results.filter(
      (result) => (result.provider_candidate_counts?.[provider] ?? 0) > 0,
    ).length;
    const errors = results.reduce(
      (sum, result) => sum + result.provider_errors.filter((error) => error.provider === provider).length,
      0,
    );
    return [provider, {
      enabled: isEnabled,
      candidate_count: candidateCount,
      works_with_candidates: worksWithCandidates,
      error_count: errors,
    }];
  }));
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

async function searchNdlBatch(titles) {
  const query = `dpid="iss-ndl-opac-national" AND (${titles
    .map((title) => `title="${escapeCqlValue(title)}"`)
    .join(' OR ')})`;
  const url = new URL('https://ndlsearch.ndl.go.jp/api/sru');
  url.search = new URLSearchParams({
    operation: 'searchRetrieve',
    recordSchema: 'dcndl',
    recordPacking: 'xml',
    onlyBib: 'true',
    maximumRecords: String(Math.min(100, Math.max(20, titles.length * 20))),
    query,
  });
  return parseNdlSru(await fetchText(url, 'ndl'));
}

function escapeCqlValue(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

async function searchGoogleBooks(title, apiKey) {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.search = new URLSearchParams({
    q: `intitle:"${title}"`,
    maxResults: '10',
    printType: 'books',
    projection: 'lite',
    key: apiKey,
  });
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
          'User-Agent': 'KAFKA2306-books-isbn-enrichment/1.2 (+https://github.com/KAFKA2306/books)',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`${provider} returned HTTP ${response.status}`);
        error.retryAfter = response.headers.get('retry-after');
        throw error;
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < providerRequestAttempts) {
        const delay = retryAfterMilliseconds(error?.retryAfter) ?? attempt * 1_000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${provider} request failed: ${errorMessage(lastError)}`);
}
