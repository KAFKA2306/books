import { canonicalIsbn13, diceSimilarity } from './catalog.mjs';

const decodeEntities = (value = '') => String(value)
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

const stripMarkup = (value = '') => decodeEntities(
  String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' '),
).replace(/\s+/g, ' ').trim();

const firstTag = (xml, localName) => {
  const pattern = new RegExp(
    `<(?:(?:[\\w.-]+):)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${localName}>`,
    'i',
  );
  const match = String(xml).match(pattern);
  return match ? stripMarkup(match[1]) : null;
};

const allTags = (xml, localName) => {
  const pattern = new RegExp(
    `<(?:(?:[\\w.-]+):)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${localName}>`,
    'gi',
  );
  return [...String(xml).matchAll(pattern)]
    .map((match) => stripMarkup(match[1]))
    .filter(Boolean);
};

const yearFrom = (value) => {
  const match = String(value ?? '').match(/(?:18|19|20)\d{2}/);
  return match ? Number(match[0]) : null;
};

const unique = (values) => [...new Set(values.filter(Boolean))];

function identifiersFromText(text) {
  const matches = String(text).match(/(?:97[89][\s-]?)?(?:\d[\s-]?){8,11}[\dX]/gi) ?? [];
  return unique(matches.map(canonicalIsbn13));
}

export function parseNdlOpenSearch(xml) {
  const items = [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .map((match) => match[1]);

  return items.flatMap((item) => {
    const typedIdentifiers = [...item.matchAll(
      /<(?:(?:[\w.-]+):)?identifier\b[^>]*(?:ISBN|isbn)[^>]*>([\s\S]*?)<\/(?:(?:[\w.-]+):)?identifier>/gi,
    )].flatMap((match) => identifiersFromText(stripMarkup(match[1])));
    const explicitIdentifiers = allTags(item, 'ISBN').flatMap(identifiersFromText);
    const isbns = unique([...typedIdentifiers, ...explicitIdentifiers]);
    if (!isbns.length) return [];

    const title = firstTag(item, 'title');
    const creators = unique([...allTags(item, 'creator'), ...allTags(item, 'author')]);
    const publisher = firstTag(item, 'publisher');
    const date = firstTag(item, 'date');
    const link = firstTag(item, 'link');

    return isbns.map((isbn13) => ({
      provider: 'ndl',
      isbn13,
      title,
      authors: creators,
      publisher,
      published_year: yearFrom(date),
      format: null,
      language: 'ja',
      source_url: link,
    }));
  });
}

export function parseGoogleBooks(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.flatMap((item) => {
    const info = item?.volumeInfo ?? {};
    const isbns = unique(
      (info.industryIdentifiers ?? []).map((entry) => canonicalIsbn13(entry?.identifier)),
    );
    return isbns.map((isbn13) => ({
      provider: 'google_books',
      isbn13,
      title: info.title ?? null,
      authors: Array.isArray(info.authors) ? info.authors : [],
      publisher: info.publisher ?? null,
      published_year: yearFrom(info.publishedDate),
      format: info.printType === 'MAGAZINE' ? '雑誌' : null,
      language: info.language ?? null,
      source_url: item?.selfLink ?? null,
    }));
  });
}

export function parseOpenBd(payload) {
  const entries = Array.isArray(payload) ? payload.filter(Boolean) : [];
  return entries.flatMap((entry) => {
    const summary = entry?.summary ?? {};
    const isbn13 = canonicalIsbn13(summary.isbn ?? entry?.onix?.RecordReference);
    if (!isbn13) return [];
    return [{
      provider: 'openbd',
      isbn13,
      title: summary.title ?? null,
      authors: summary.author ? [summary.author] : [],
      publisher: summary.publisher ?? null,
      published_year: yearFrom(summary.pubdate),
      format: null,
      language: 'ja',
      source_url: `https://api.openbd.jp/v1/get?isbn=${isbn13}`,
    }];
  });
}

export function consolidateCandidates(work, candidates, { titleThreshold = 0.95 } = {}) {
  const grouped = new Map();
  for (const candidate of candidates) {
    const isbn13 = canonicalIsbn13(candidate?.isbn13);
    if (!isbn13 || !candidate?.title) continue;
    const similarity = diceSimilarity(work.title, candidate.title);
    if (similarity < titleThreshold) continue;

    const current = grouped.get(isbn13) ?? {
      isbn13,
      providers: new Set(),
      records: [],
      best_similarity: 0,
    };
    current.providers.add(candidate.provider);
    current.records.push({ ...candidate, isbn13, title_similarity: similarity });
    current.best_similarity = Math.max(current.best_similarity, similarity);
    grouped.set(isbn13, current);
  }

  const supported = [...grouped.values()]
    .filter((candidate) => candidate.providers.size >= 2)
    .sort((left, right) => (
      right.providers.size - left.providers.size
      || right.best_similarity - left.best_similarity
      || left.isbn13.localeCompare(right.isbn13)
    ));

  if (!supported.length) {
    return { outcome: 'no_consensus', accepted: null, candidates: [] };
  }
  if (supported.length !== 1) {
    return {
      outcome: 'ambiguous',
      accepted: null,
      candidates: supported.map(serializeCandidate),
    };
  }

  const winner = supported[0];
  const preferred = [...winner.records]
    .sort((left, right) => providerRank(left.provider) - providerRank(right.provider))[0];
  const sources = unique(
    winner.records.map((record) => `${record.provider}\t${record.source_url ?? ''}`),
  ).map((value) => {
    const [provider, url] = value.split('\t');
    return { provider, url: url || null };
  });

  return {
    outcome: 'accepted',
    accepted: {
      work_id: work.work_id,
      isbn13: winner.isbn13,
      title: preferred.title,
      authors: unique(winner.records.flatMap((record) => record.authors ?? [])),
      publisher: winner.records.map((record) => record.publisher).find(Boolean) ?? null,
      published_year: winner.records.map((record) => record.published_year).find(Boolean) ?? null,
      format: winner.records.map((record) => record.format).find(Boolean) ?? null,
      language: winner.records.map((record) => record.language).find(Boolean) ?? null,
      title_similarity: winner.best_similarity,
      sources,
    },
    candidates: [serializeCandidate(winner)],
  };
}

const providerRank = (provider) => ({ ndl: 0, openbd: 1, google_books: 2 }[provider] ?? 9);

const serializeCandidate = (candidate) => ({
  isbn13: candidate.isbn13,
  providers: [...candidate.providers].sort(),
  best_similarity: candidate.best_similarity,
});

export function eligibleWorks(catalog, state, now = new Date()) {
  const attempts = state?.attempts ?? {};
  const editionsByWork = new Map();
  for (const edition of catalog.editions) {
    const list = editionsByWork.get(edition.work_id) ?? [];
    list.push(edition);
    editionsByWork.set(edition.work_id, list);
  }

  const holdingsByEdition = new Map();
  for (const holding of catalog.holdings) {
    const list = holdingsByEdition.get(holding.edition_id) ?? [];
    list.push(holding);
    holdingsByEdition.set(holding.edition_id, list);
  }

  return catalog.works.flatMap((work) => {
    const editions = editionsByWork.get(work.work_id) ?? [];
    if (editions.some((edition) => edition.verification === 'verified' && edition.isbn13)) {
      return [];
    }

    const pending = editions.filter((edition) => (
      edition.edition_id.startsWith('pending:')
      && !edition.isbn13
      && edition.verification === 'unverified'
    ));
    if (pending.length !== 1) return [];

    const holdings = holdingsByEdition.get(pending[0].edition_id) ?? [];
    if (holdings.some((holding) => /kindle|電子/i.test(holding.format ?? ''))) return [];

    const nextAttempt = attempts[work.work_id]?.next_attempt_at;
    if (nextAttempt && new Date(nextAttempt) > now) return [];
    return [{ work, pending_edition: pending[0] }];
  }).sort((left, right) => left.work.work_id.localeCompare(right.work.work_id));
}

export function applyIsbnEnrichments(catalog, overlay) {
  const records = Array.isArray(overlay?.records) ? overlay.records : [];
  if (!records.length) return catalog;

  const works = catalog.works.map((work) => ({ ...work }));
  let editions = catalog.editions.map((edition) => ({ ...edition }));
  let holdings = catalog.holdings.map((holding) => ({ ...holding }));
  const workById = new Map(works.map((work) => [work.work_id, work]));
  const isbnOwner = new Map(
    editions.filter((edition) => edition.isbn13)
      .map((edition) => [edition.isbn13, edition.work_id]),
  );

  for (const record of records) {
    const isbn13 = canonicalIsbn13(record.isbn13);
    if (!isbn13) throw new Error(`Invalid enrichment ISBN: ${record.isbn13}`);
    const work = workById.get(record.work_id);
    if (!work) throw new Error(`Unknown enrichment work: ${record.work_id}`);

    const existingOwner = isbnOwner.get(isbn13);
    if (existingOwner && existingOwner !== record.work_id) {
      throw new Error(`ISBN ${isbn13} belongs to multiple works`);
    }
    if (existingOwner === record.work_id) continue;

    const index = editions.findIndex((edition) => (
      edition.edition_id === record.replaces_edition_id
      && edition.work_id === record.work_id
    ));
    if (index < 0) throw new Error(`Missing pending edition ${record.replaces_edition_id}`);

    const previous = editions[index];
    if (previous.isbn13 || previous.verification !== 'unverified') {
      throw new Error(`Edition ${previous.edition_id} is not replaceable`);
    }

    const editionId = `isbn13:${isbn13}`;
    if (editions.some((edition, editionIndex) => (
      editionIndex !== index && edition.edition_id === editionId
    ))) {
      throw new Error(`Duplicate edition id ${editionId}`);
    }

    editions[index] = {
      ...previous,
      edition_id: editionId,
      id_kind: 'isbn13',
      isbn13,
      isbn10: record.isbn10 ?? null,
      title: record.title ?? work.title,
      authors: record.authors?.length ? record.authors : null,
      publisher: record.publisher ?? null,
      published_year: record.published_year ?? null,
      format: record.format ?? previous.format ?? null,
      language: record.language ?? previous.language ?? 'ja',
      verification: 'verified',
      source_url: record.sources?.find((source) => source.url)?.url ?? null,
      verification_sources: record.sources ?? [],
      verified_at: record.verified_at,
    };
    holdings = holdings.map((holding) => (
      holding.edition_id === previous.edition_id
        ? { ...holding, edition_id: editionId }
        : holding
    ));
    isbnOwner.set(isbn13, record.work_id);
  }

  const editionsByWork = new Map();
  for (const edition of editions) {
    const list = editionsByWork.get(edition.work_id) ?? [];
    list.push(edition);
    editionsByWork.set(edition.work_id, list);
  }

  for (const work of works) {
    const list = editionsByWork.get(work.work_id) ?? [];
    const verified = list.filter((edition) => (
      edition.verification === 'verified' && edition.isbn13
    ));
    work.isbn_count = new Set(verified.map((edition) => edition.isbn13)).size;
    work.isbn_status = work.isbn_count ? 'verified' : 'missing';
    const authored = list.find((edition) => (
      Array.isArray(edition.authors) ? edition.authors.length : edition.authors
    ));
    if (authored) work.author = authored.authors;
  }

  const stats = {
    ...catalog.stats,
    edition_count: editions.length,
    holding_count: holdings.length,
    isbn_verified_count: new Set(
      editions.filter((edition) => edition.verification === 'verified')
        .map((edition) => edition.isbn13)
        .filter(Boolean),
    ).size,
  };

  return { ...catalog, stats, works, editions, holdings };
}

export function retryAfter(outcome, now = new Date()) {
  const days = {
    accepted: 3650,
    ambiguous: 90,
    no_consensus: 30,
    no_candidate: 30,
    provider_error: 1,
  }[outcome] ?? 7;
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}
