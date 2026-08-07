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

const results = [];
for (const { work, pending_edition: pendingEdition } of selected) {
  const providerErrors = [];
  let candidates = [];

  try {
    candidates.push(...await searchNdl(work.title));
  } catch (error) {
    providerErrors.push({ provider: 'ndl', message: error.message });
  }

  try {
    candidates.push(...await searchGoogleBooks(work.title));
  } catch (error) {
    providerErrors.push({ provider: 'google_books', message: error.message });
  }

  const candidateIsbns = [...new Set(candidates.map((candidate) => candidate.isbn13))]
    .slice(0, 20);
  if (candidateIsbns.length) {
    try {
      candidates.push(...await lookupOpenBd(candidateIsbns));
    } catch (error) {
      providerErrors.push({ provider: 'openbd', message: error.message });
    }
  }

  const decision = consolidateCandidates(work, candidates);
  let outcome = decision.outcome;
  if (!candidates.length && providerErrors.length) outcome = 'provider_error';
  else if (!candidates.length) outcome = 'no_candidate';
  else if (outcome === 'no_consensus' && providerErrors.length >= 2) {
    outcome = 'provider_error';
  }

  if (outcome === 'accepted') {
    overlay.records.push({
      ...decision.accepted,
      replaces_edition_id: pendingEdition.edition_id,
      verified_at: nowIso,
    });
  }

  state.attempts[work.work_id] = {
    attempted_at: nowIso,
    outcome,
    next_attempt_at: retryAfter(outcome, now),
    candidate_count: decision.candidates.length,
    provider_errors: providerErrors,
  };
  results.push({
    work_id: work.work_id,
    title: work.title,
    outcome,
    accepted_isbn13: decision.accepted?.isbn13 ?? null,
    candidates: decision.candidates,
    provider_errors: providerErrors,
  });
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
    minimum_distinct_providers: 2,
    title_similarity_threshold: 0.95,
    ambiguous_candidates_are_rejected: true,
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
  let dryRun = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--dry-run') dryRun = true;
    else if (value === '--limit') limit = Number(values[index += 1]);
    else if (value.startsWith('--limit=')) limit = Number(value.slice('--limit='.length));
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('--limit must be an integer from 1 to 100');
  }
  return { limit, dryRun };
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
  if (process.env.GOOGLE_BOOKS_API_KEY) {
    params.set('key', process.env.GOOGLE_BOOKS_API_KEY);
  }
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
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'KAFKA2306-books-isbn-enrichment/1.0 (+https://github.com/KAFKA2306/books)',
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${provider} returned HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${provider} request failed: ${lastError?.message ?? 'unknown error'}`);
}
