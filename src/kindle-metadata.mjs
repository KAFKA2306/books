import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeTitle, titleKey } from './catalog.mjs';

const ORIGIN_TYPES = new Map([
  ['Purchase', 'purchase'],
  ['Sample', 'sample'],
  ['Prime', 'prime'],
  ['KindleDictionary', 'kindle_dictionary'],
]);

const ORIGIN_RANK = new Map([
  ['purchase', 0],
  ['prime', 1],
  ['sample', 2],
  ['unknown', 3],
  ['kindle_dictionary', 4],
]);

function decodeXmlEntities(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

export function normalizeAmazonDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.replace(/([+-]\d{2})(\d{2})$/, '$1:$2').replace(/\+00:00$/, 'Z');
}

function tagValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXmlEntities(match[1].trim()) : '';
}

function listValues(block, parent, child) {
  const parentMatch = block.match(new RegExp(`<${parent}(?:\\s[^>]*)?>([\\s\\S]*?)</${parent}>`, 'i'));
  if (!parentMatch) return [];
  return [...parentMatch[1].matchAll(new RegExp(`<${child}(?:\\s[^>]*)?>([\\s\\S]*?)</${child}>`, 'gi'))]
    .map((match) => decodeXmlEntities(match[1].trim()))
    .filter(Boolean);
}

export function parseKindleMetadataXml(source) {
  const text = String(source);
  const syncRaw = tagValue(text, 'sync_time');
  const syncParts = syncRaw.split(';');
  const softwarePart = syncParts.find((part) => part.startsWith('softwareVersion:'));
  const records = [...text.matchAll(/<meta_data>([\s\S]*?)<\/meta_data>/gi)].map((match, index) => {
    const block = match[1];
    const origins = listValues(block, 'origins', 'type');
    const sourceOrigin = origins[0] ?? null;
    return {
      ordinal: index + 1,
      asin: tagValue(block, 'ASIN'),
      title: tagValue(block, 'title'),
      authors: listValues(block, 'authors', 'author'),
      publishers: listValues(block, 'publishers', 'publisher'),
      publication_date: normalizeAmazonDate(tagValue(block, 'publication_date')),
      acquired_at: normalizeAmazonDate(tagValue(block, 'purchase_date')),
      origin_type: ORIGIN_TYPES.get(sourceOrigin) ?? 'unknown',
      cde_contenttype: tagValue(block, 'cde_contenttype') || null,
      content_type: tagValue(block, 'content_type') || null,
      textbook_type: tagValue(block, 'textbook_type') || null,
    };
  });

  return {
    sync_time: normalizeAmazonDate(syncParts[0] || null),
    source_software_version: softwarePart ? softwarePart.slice('softwareVersion:'.length) : null,
    records,
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function loadKindleMetadata(root = process.cwd()) {
  const dataDir = path.join(root, 'data', 'kindle');
  const manifest = JSON.parse(await fs.readFile(path.join(dataDir, 'manifest.json'), 'utf8'));
  const records = [];

  for (const part of manifest.parts) {
    const content = await fs.readFile(path.join(dataDir, part.name), 'utf8');
    const bytes = Buffer.byteLength(content);
    if (bytes !== part.bytes) throw new Error(`Kindle metadata byte mismatch: ${part.name}`);
    if (sha256(content) !== part.sha256) throw new Error(`Kindle metadata SHA-256 mismatch: ${part.name}`);
    const rows = content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    if (rows.length !== part.records) throw new Error(`Kindle metadata record mismatch: ${part.name}`);
    records.push(...rows);
  }

  if (records.length !== manifest.record_count) throw new Error('Kindle metadata total record count mismatch');
  if (new Set(records.map((record) => record.asin)).size !== manifest.unique_asin_count) {
    throw new Error('Kindle metadata unique ASIN count mismatch');
  }
  return { manifest, records };
}

function chooseRepresentative(records) {
  return [...records].sort((a, b) => {
    const rank = (ORIGIN_RANK.get(a.origin_type) ?? 99) - (ORIGIN_RANK.get(b.origin_type) ?? 99);
    if (rank) return rank;
    const completenessA = Number(Boolean(a.authors?.length)) + Number(Boolean(a.publishers?.length)) + Number(Boolean(a.publication_date));
    const completenessB = Number(Boolean(b.authors?.length)) + Number(Boolean(b.publishers?.length)) + Number(Boolean(b.publication_date));
    return completenessB - completenessA || a.ordinal - b.ordinal;
  })[0];
}

function workIdForKey(key) {
  return `wrk_${sha256(key).slice(0, 12)}`;
}

function acquisitionId(record) {
  return `acq_kindle_${sha256(`${record.asin}|${record.origin_type}|${record.acquired_at ?? ''}|${record.ordinal}`).slice(0, 16)}`;
}

export function mergeKindleCatalog(catalog, kindleData) {
  const works = catalog.works.map((work) => ({
    ...work,
    sources: [...(work.sources ?? [])],
    formats: [...(work.formats ?? [])],
  }));
  let editions = catalog.editions.map((edition) => ({ ...edition }));
  let holdings = catalog.holdings.map((holding) => ({ ...holding }));
  const records = kindleData.records.map((record) => ({ ...record }));

  const workByKey = new Map(works.map((work) => [work.title_key, work]));
  const workById = new Map(works.map((work) => [work.work_id, work]));
  const editionById = new Map(editions.map((edition) => [edition.edition_id, edition]));
  const recordsByAsin = new Map();
  for (const record of records) {
    const list = recordsByAsin.get(record.asin) ?? [];
    list.push(record);
    recordsByAsin.set(record.asin, list);
  }

  const ownedWorkByAsin = new Map();
  const ownedEditionByAsin = new Map();
  const ownedWorkIds = new Set();
  let newWorkCount = 0;

  for (const [asin, asinRecords] of recordsByAsin) {
    const purchaseRecords = asinRecords.filter((record) => record.origin_type === 'purchase');
    if (!purchaseRecords.length) continue;
    const representative = chooseRepresentative(purchaseRecords);
    const canonicalTitle = normalizeTitle(representative.title);
    const key = titleKey(canonicalTitle);
    if (!key) throw new Error(`Kindle purchase has empty normalized title: ${asin}`);

    let work = workByKey.get(key);
    if (!work) {
      const workId = workIdForKey(key);
      if (workById.has(workId)) throw new Error(`Kindle work ID collision: ${workId}`);
      work = {
        work_id: workId,
        title: canonicalTitle,
        title_key: key,
        author: representative.authors?.length ? representative.authors.join(' / ') : null,
        category: '未分類',
        status: 'untracked',
        progress: null,
        rating: null,
        price_yen: null,
        acquired_at: null,
        item_count: 0,
        isbn_count: 0,
        isbn_status: 'missing',
        sources: [],
        formats: [],
      };
      works.push(work);
      workByKey.set(key, work);
      workById.set(workId, work);
      newWorkCount += 1;
    }

    const editionId = `asin:${asin}`;
    if (!editionById.has(editionId)) {
      const edition = {
        edition_id: editionId,
        id_kind: 'asin',
        asin,
        work_id: work.work_id,
        isbn13: null,
        isbn10: null,
        title: representative.title,
        authors: representative.authors?.length ? representative.authors.join(' / ') : null,
        publisher: representative.publishers?.length ? representative.publishers.join(' / ') : null,
        published_at: representative.publication_date,
        published_year: representative.publication_date ? Number(representative.publication_date.slice(0, 4)) : null,
        format: 'Kindle',
        language: null,
        verification: 'unverified',
        metadata_source: 'kindle_xml',
        source_url: null,
      };
      editions.push(edition);
      editionById.set(editionId, edition);
    }

    ownedWorkByAsin.set(asin, work.work_id);
    ownedEditionByAsin.set(asin, editionId);
    ownedWorkIds.add(work.work_id);
  }

  const screenshotHoldings = holdings.filter(
    (holding) => holding.source === 'Kindleスクリーンショット' && ownedWorkIds.has(holding.work_id),
  );
  const screenshotHoldingIds = new Set(screenshotHoldings.map((holding) => holding.holding_id));
  holdings = holdings.filter((holding) => !screenshotHoldingIds.has(holding.holding_id));

  const referencedEditionIds = new Set(holdings.map((holding) => holding.edition_id).filter(Boolean));
  editions = editions.filter((edition) => !(
    edition.edition_id.startsWith('kindle:')
    && ownedWorkIds.has(edition.work_id)
    && edition.verification === 'unverified'
    && !referencedEditionIds.has(edition.edition_id)
  ));

  const existingHoldingIds = new Set(holdings.map((holding) => holding.holding_id));
  for (const [asin, workId] of ownedWorkByAsin) {
    const purchaseRecords = recordsByAsin.get(asin).filter((record) => record.origin_type === 'purchase');
    const acquiredAt = purchaseRecords.map((record) => record.acquired_at).filter(Boolean).sort()[0] ?? null;
    const holdingId = `hld_kindle_${asin}`;
    if (existingHoldingIds.has(holdingId)) continue;
    holdings.push({
      holding_id: holdingId,
      work_id: workId,
      edition_id: ownedEditionByAsin.get(asin),
      source: 'Amazon Kindle XML',
      format: 'Kindle',
      quantity: 1,
      acquired_at: acquiredAt,
      price_yen: null,
      progress: null,
      rating: null,
    });
    existingHoldingIds.add(holdingId);
  }

  const holdingsByWork = new Map();
  for (const holding of holdings) {
    const list = holdingsByWork.get(holding.work_id) ?? [];
    list.push(holding);
    holdingsByWork.set(holding.work_id, list);
  }
  const editionsByWork = new Map();
  for (const edition of editions) {
    const list = editionsByWork.get(edition.work_id) ?? [];
    list.push(edition);
    editionsByWork.set(edition.work_id, list);
  }

  for (const work of works) {
    const workHoldings = holdingsByWork.get(work.work_id) ?? [];
    work.item_count = workHoldings.reduce((sum, holding) => sum + holding.quantity, 0);
    const sources = [...new Set(workHoldings.map((holding) => holding.source).filter(Boolean))];
    const formats = [...new Set(workHoldings.map((holding) => holding.format).filter(Boolean))];
    work.sources = sources;
    work.formats = formats;
    const workEditions = editionsByWork.get(work.work_id) ?? [];
    const verified = workEditions.filter((edition) => edition.verification === 'verified' && edition.isbn13);
    work.isbn_count = new Set(verified.map((edition) => edition.isbn13)).size;
    work.isbn_status = work.isbn_count ? 'verified' : 'missing';
    if (!work.author) {
      const authored = workEditions.find((edition) => edition.authors);
      if (authored) work.author = authored.authors;
    }
  }

  const acquisitions = records.map((record) => ({
    acquisition_id: acquisitionId(record),
    provider: 'amazon_kindle',
    source_record_ordinal: record.ordinal,
    asin: record.asin,
    work_id: ownedWorkByAsin.get(record.asin) ?? null,
    edition_id: ownedEditionByAsin.get(record.asin) ?? null,
    acquisition_type: record.origin_type,
    acquired_at: record.acquired_at,
    owned: record.origin_type === 'purchase',
  }));

  const kindleItems = [...recordsByAsin.entries()].map(([asin, asinRecords]) => {
    const representative = chooseRepresentative(asinRecords);
    const originTypes = [...new Set(asinRecords.map((record) => record.origin_type))].sort(
      (a, b) => (ORIGIN_RANK.get(a) ?? 99) - (ORIGIN_RANK.get(b) ?? 99),
    );
    const acquiredDates = asinRecords.map((record) => record.acquired_at).filter(Boolean).sort();
    return {
      asin,
      title: representative.title,
      authors: representative.authors,
      publishers: representative.publishers,
      publication_date: representative.publication_date,
      cde_contenttype: representative.cde_contenttype,
      content_type: representative.content_type,
      textbook_type: representative.textbook_type,
      origin_types: originTypes,
      owned: originTypes.includes('purchase'),
      work_id: ownedWorkByAsin.get(asin) ?? null,
      edition_id: ownedEditionByAsin.get(asin) ?? null,
      record_count: asinRecords.length,
      first_acquired_at: acquiredDates[0] ?? null,
      last_acquired_at: acquiredDates.at(-1) ?? null,
    };
  }).sort((a, b) => a.title.localeCompare(b.title, 'ja'));

  works.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  editions.sort((a, b) => a.edition_id.localeCompare(b.edition_id));
  holdings.sort((a, b) => a.holding_id.localeCompare(b.holding_id));

  const stats = {
    ...catalog.stats,
    input_count: holdings.reduce((sum, holding) => sum + holding.quantity, 0),
    work_count: works.length,
    edition_count: editions.length,
    holding_count: holdings.length,
    merged_input_count: holdings.reduce((sum, holding) => sum + holding.quantity, 0) - works.length,
    isbn_verified_count: new Set(editions.filter((edition) => edition.verification === 'verified').map((edition) => edition.isbn13).filter(Boolean)).size,
    untracked_count: works.filter((work) => work.status === 'untracked').length,
    kindle_record_count: records.length,
    kindle_unique_asin_count: recordsByAsin.size,
    kindle_purchase_record_count: records.filter((record) => record.origin_type === 'purchase').length,
    kindle_owned_asin_count: ownedWorkByAsin.size,
    kindle_sample_record_count: records.filter((record) => record.origin_type === 'sample').length,
    kindle_prime_record_count: records.filter((record) => record.origin_type === 'prime').length,
    kindle_new_work_count: newWorkCount,
    kindle_replaced_screenshot_holding_count: screenshotHoldings.length,
  };

  return {
    ...catalog,
    stats,
    works,
    editions,
    holdings,
    kindle_records: records,
    kindle_items: kindleItems,
    acquisitions,
  };
}
