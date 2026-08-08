import crypto from 'node:crypto';
import { cleanSpace, normalizeTitle, titleKey } from './catalog.mjs';

const ACQUISITION_TYPES = new Set(['Purchase', 'Prime', 'Sample']);
const CATALOG_TYPES = new Set(['Purchase', 'Prime']);
const TYPE_PRIORITY = new Map([
  ['Purchase', 40],
  ['Prime', 30],
  ['Sample', 20],
  ['KindleDictionary', 10],
]);

function hash(value, length = 16) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, length);
}

function decodeXmlText(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function extractOne(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXmlText(match[1]) : '';
}

function extractMany(block, tag) {
  const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  return [...block.matchAll(regex)].map((match) => decodeXmlText(match[1])).filter(Boolean);
}

function stableRecord(record) {
  return {
    asin: record.asin,
    title: record.title,
    authors: record.authors,
    publishers: record.publishers,
    publication_date: record.publication_date,
    acquired_at: record.acquired_at,
    cde_contenttype: record.cde_contenttype,
    content_type: record.content_type,
    acquisition_type: record.acquisition_type,
  };
}

function signature(record) {
  return JSON.stringify(stableRecord(record));
}

export function parseKindleMetadataText(text) {
  const source = String(text);
  const syncRaw = extractOne(source, 'sync_time');
  const sourceSyncTime = syncRaw ? syncRaw.split(';', 1)[0] : null;
  const blocks = [...source.matchAll(/<meta_data>([\s\S]*?)<\/meta_data>/gi)].map((match) => match[1]);
  const records = [];
  const seen = new Set();

  for (const block of blocks) {
    const record = {
      asin: extractOne(block, 'ASIN'),
      title: cleanSpace(extractOne(block, 'title')),
      authors: extractMany(block, 'author').map(cleanSpace),
      publishers: extractMany(block, 'publisher').map(cleanSpace),
      publication_date: extractOne(block, 'publication_date') || null,
      acquired_at: extractOne(block, 'purchase_date') || null,
      cde_contenttype: extractOne(block, 'cde_contenttype') || null,
      content_type: extractOne(block, 'content_type') || null,
      acquisition_type: extractMany(block, 'type')[0] || null,
    };
    if (!record.asin || !record.title) continue;
    const key = signature(record);
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({ record_id: `knd_${hash(key)}`, ...record });
  }

  return {
    schema: 'kafka.books.kindle-metadata.v1',
    source: 'KindleSyncMetadataCache.xml',
    source_sync_time: sourceSyncTime,
    raw_record_count: blocks.length,
    record_count: records.length,
    records,
  };
}

export function normalizeKindleWorkTitle(value = '') {
  let s = cleanSpace(value);
  if (!s) return '';
  s = s
    .replace(/【単行本版】\s*[0-9０-９]+/gi, ' ')
    .replace(/\s*[（(](?:[^）)]*(?:コミック(?:ス)?|文庫|新書|電子書籍|English Edition|単行本版)[^）)]*)[）)]\s*$/gi, ' ')
    .replace(/\s*[（(][0-9０-９一二三四五六七八九十]+[）)]\s*(?=$|[（(【])/g, ' ')
    .replace(/\s*[（(](?:上|中|下)[）)]\s*/g, ' ')
    .replace(/\s+(?:上|中|下)\s+(?=\S)/g, ' ')
    .replace(/(?:第\s*)?[0-9０-９一二三四五六七八九十]+\s*(?:巻|冊)(?=\s|$)/g, ' ');
  return normalizeTitle(cleanSpace(s));
}

function workKey(value) {
  return titleKey(normalizeKindleWorkTitle(value));
}

function preferredRecord(records) {
  return [...records].sort((a, b) => {
    const priority = (TYPE_PRIORITY.get(b.acquisition_type) ?? 0) - (TYPE_PRIORITY.get(a.acquisition_type) ?? 0);
    if (priority) return priority;
    const richnessA = a.authors.length + a.publishers.length + Number(Boolean(a.publication_date));
    const richnessB = b.authors.length + b.publishers.length + Number(Boolean(b.publication_date));
    if (richnessA !== richnessB) return richnessB - richnessA;
    return String(b.acquired_at ?? '').localeCompare(String(a.acquired_at ?? ''));
  })[0];
}

export function buildKindleSnapshot(input) {
  const records = input.records ?? [];
  const byAsin = new Map();
  for (const record of records) {
    const list = byAsin.get(record.asin) ?? [];
    list.push(record);
    byAsin.set(record.asin, list);
  }

  const items = [...byAsin.entries()].map(([asin, asinRecords]) => {
    const preferred = preferredRecord(asinRecords);
    const accessTypes = [...new Set(asinRecords.map((record) => record.acquisition_type).filter(Boolean))];
    const acquisitionDates = asinRecords.map((record) => record.acquired_at).filter(Boolean).sort();
    return {
      item_id: `asin:${asin}`,
      asin,
      title: preferred.title,
      authors: preferred.authors,
      publishers: preferred.publishers,
      publication_date: preferred.publication_date,
      cde_contenttype: preferred.cde_contenttype,
      content_type: preferred.content_type,
      access_types: accessTypes,
      catalog_eligible: accessTypes.some((type) => CATALOG_TYPES.has(type)),
      first_acquired_at: acquisitionDates[0] ?? null,
      last_acquired_at: acquisitionDates.at(-1) ?? null,
    };
  });

  const acquisitionSeen = new Set();
  const acquisitions = [];
  for (const record of records) {
    if (!ACQUISITION_TYPES.has(record.acquisition_type)) continue;
    const type = record.acquisition_type;
    const key = `${record.asin}|${type}|${record.acquired_at ?? ''}|${record.cde_contenttype ?? ''}`;
    if (acquisitionSeen.has(key)) continue;
    acquisitionSeen.add(key);
    acquisitions.push({
      acquisition_id: `acq_${hash(key)}`,
      provider: 'amazon_kindle',
      asin: record.asin,
      acquisition_type: type.toLowerCase(),
      acquired_at: record.acquired_at,
      owned: type === 'Purchase',
      access_model: type === 'Purchase' ? 'owned' : type === 'Prime' ? 'subscription' : 'sample',
    });
  }

  return { ...input, items, acquisitions };
}

function uniqueExistingWorkMap(works) {
  const buckets = new Map();
  for (const work of works) {
    const key = workKey(work.title);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(work);
    buckets.set(key, list);
  }
  return new Map([...buckets].map(([key, list]) => [key, list.length === 1 ? list[0] : null]));
}

function publishedYear(value) {
  const match = String(value ?? '').match(/^(\d{4})/);
  return match ? Number(match[1]) : null;
}

export function applyKindleMetadata(catalog, input) {
  const snapshot = buildKindleSnapshot(input);
  const works = catalog.works.map((work) => ({ ...work, sources: [...(work.sources ?? [])], formats: [...(work.formats ?? [])] }));
  let editions = catalog.editions.map((edition) => ({ ...edition }));
  let holdings = catalog.holdings.map((holding) => ({ ...holding }));
  const workById = new Map(works.map((work) => [work.work_id, work]));
  const existingByKey = uniqueExistingWorkMap(works);
  const editionByAsin = new Map(editions.filter((edition) => edition.asin).map((edition) => [edition.asin, edition]));
  const mappedByAsin = new Map();
  const itemByAsin = new Map(snapshot.items.map((item) => [item.asin, item]));
  const acquisitionsByAsin = new Map();
  for (const acquisition of snapshot.acquisitions) {
    const list = acquisitionsByAsin.get(acquisition.asin) ?? [];
    list.push(acquisition);
    acquisitionsByAsin.set(acquisition.asin, list);
  }

  for (const item of snapshot.items.filter((entry) => entry.catalog_eligible)) {
    const key = workKey(item.title);
    if (!key) continue;
    let work = existingByKey.get(key) ?? null;
    if (!work) {
      const title = normalizeKindleWorkTitle(item.title);
      const workId = `wrk_${hash(titleKey(title), 12)}`;
      const collision = workById.get(workId);
      if (collision && collision.title_key !== titleKey(title)) continue;
      work = collision ?? {
        work_id: workId,
        title,
        title_key: titleKey(title),
        author: item.authors.join(' / ') || null,
        category: '未分類',
        status: 'untracked',
        progress: null,
        rating: null,
        price_yen: null,
        acquired_at: item.first_acquired_at,
        item_count: 0,
        isbn_count: 0,
        isbn_status: 'missing',
        sources: [],
        formats: [],
      };
      if (!collision) {
        works.push(work);
        workById.set(work.work_id, work);
        existingByKey.set(key, work);
      }
    } else if (!work.author && item.authors.length) {
      work.author = item.authors.join(' / ');
    }

    let edition = editionByAsin.get(item.asin);
    if (!edition) {
      edition = {
        edition_id: `asin:${item.asin}`,
        id_kind: 'asin',
        work_id: work.work_id,
        asin: item.asin,
        isbn13: null,
        isbn10: null,
        title: item.title,
        authors: item.authors.join(' / ') || null,
        publisher: item.publishers.join(' / ') || null,
        published_at: item.publication_date,
        published_year: publishedYear(item.publication_date),
        format: 'Kindle',
        language: null,
        verification: 'source_metadata',
        source_url: null,
      };
      editions.push(edition);
      editionByAsin.set(item.asin, edition);
    }
    mappedByAsin.set(item.asin, { work, edition });
  }

  const mappedWorkIds = new Set([...mappedByAsin.values()].map(({ work }) => work.work_id));
  holdings = holdings.filter((holding) => !(holding.source === 'Kindleスクリーンショット' && mappedWorkIds.has(holding.work_id)));
  const referencedEditionIds = new Set(holdings.map((holding) => holding.edition_id).filter(Boolean));
  editions = editions.filter((edition) => !(
    edition.id_kind === 'source_scoped'
    && edition.format === 'Kindle'
    && mappedWorkIds.has(edition.work_id)
    && !referencedEditionIds.has(edition.edition_id)
  ));

  const holdingIds = new Set(holdings.map((holding) => holding.holding_id));
  for (const [asin, mapped] of mappedByAsin) {
    const item = itemByAsin.get(asin);
    const events = acquisitionsByAsin.get(asin) ?? [];
    const event = events.find((entry) => entry.acquisition_type === 'purchase')
      ?? events.find((entry) => entry.acquisition_type === 'prime');
    if (!event) continue;
    const holdingId = `hld_amazon_${asin.toLowerCase()}`;
    if (holdingIds.has(holdingId)) continue;
    holdings.push({
      holding_id: holdingId,
      work_id: mapped.work.work_id,
      edition_id: mapped.edition.edition_id,
      source: event.acquisition_type === 'purchase' ? 'Amazon Kindle' : 'Amazon Prime Reading',
      format: 'Kindle',
      quantity: 1,
      acquired_at: event.acquired_at ?? item.first_acquired_at,
      price_yen: null,
      progress: null,
      rating: null,
      acquisition_type: event.acquisition_type,
      owned: event.owned,
    });
    holdingIds.add(holdingId);
  }

  const holdingsByWork = new Map();
  for (const holding of holdings) {
    const list = holdingsByWork.get(holding.work_id) ?? [];
    list.push(holding);
    holdingsByWork.set(holding.work_id, list);
  }
  for (const work of works) {
    const list = holdingsByWork.get(work.work_id) ?? [];
    work.item_count = list.reduce((sum, holding) => sum + (holding.quantity ?? 1), 0);
    work.sources = [...new Set(list.map((holding) => holding.source).filter(Boolean))];
    work.formats = [...new Set(list.map((holding) => holding.format).filter(Boolean))];
  }

  const enrichedItems = snapshot.items.map((item) => {
    const mapped = mappedByAsin.get(item.asin);
    return { ...item, work_id: mapped?.work.work_id ?? null, edition_id: mapped?.edition.edition_id ?? null };
  });
  const enrichedAcquisitions = snapshot.acquisitions.map((acquisition) => {
    const mapped = mappedByAsin.get(acquisition.asin);
    return { ...acquisition, work_id: mapped?.work.work_id ?? null, edition_id: mapped?.edition.edition_id ?? null };
  });
  const enrichedRecords = snapshot.records.map((record) => {
    const mapped = mappedByAsin.get(record.asin);
    return { ...record, work_id: mapped?.work.work_id ?? null, edition_id: mapped?.edition.edition_id ?? null };
  });

  works.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  editions.sort((a, b) => a.edition_id.localeCompare(b.edition_id));
  holdings.sort((a, b) => a.holding_id.localeCompare(b.holding_id));

  const inputCount = works.reduce((sum, work) => sum + work.item_count, 0);
  const stats = {
    ...catalog.stats,
    input_count: inputCount,
    work_count: works.length,
    edition_count: editions.length,
    holding_count: holdings.length,
    merged_input_count: inputCount - works.length,
    untracked_count: works.filter((work) => work.status === 'untracked').length,
    kindle_source_record_count: snapshot.records.length,
    kindle_item_count: snapshot.items.length,
    kindle_acquisition_count: snapshot.acquisitions.length,
    kindle_catalog_item_count: snapshot.items.filter((item) => item.catalog_eligible).length,
    kindle_purchase_count: snapshot.acquisitions.filter((item) => item.acquisition_type === 'purchase').length,
    kindle_prime_count: snapshot.acquisitions.filter((item) => item.acquisition_type === 'prime').length,
    kindle_sample_count: snapshot.acquisitions.filter((item) => item.acquisition_type === 'sample').length,
  };

  return {
    ...catalog,
    schema_version: '1.1.0',
    key_policy: {
      ...catalog.key_policy,
      edition: 'ISBN-13 for verified print editions; ASIN for Kindle editions',
    },
    stats,
    works,
    editions,
    holdings,
    acquisitions: enrichedAcquisitions,
    kindle_items: enrichedItems,
    kindle_records: enrichedRecords,
  };
}
