import { loadCatalog } from './load-catalog.mjs';
import { isValidIsbn13, titleKey } from '../src/catalog.mjs';

const catalog = await loadCatalog();
const failures = [];
const unique = (items) => new Set(items).size === items.length;

if (!unique(catalog.works.map((work) => work.work_id))) failures.push('work_id is not unique');
if (!unique(catalog.works.map((work) => work.title_key))) failures.push('title_key is not unique');
if (!unique(catalog.editions.map((edition) => edition.edition_id))) failures.push('edition_id is not unique');
if (!unique(catalog.holdings.map((holding) => holding.holding_id))) failures.push('holding_id is not unique');

const workIds = new Set(catalog.works.map((work) => work.work_id));
const editionIds = new Set(catalog.editions.map((edition) => edition.edition_id));
for (const work of catalog.works) {
  if (titleKey(work.title) !== work.title_key) failures.push(`title_key mismatch: ${work.title}`);
}
for (const edition of catalog.editions) {
  if (!workIds.has(edition.work_id)) failures.push(`orphan edition: ${edition.edition_id}`);
  if (edition.isbn13 && !isValidIsbn13(edition.isbn13)) failures.push(`invalid ISBN-13: ${edition.isbn13}`);
  if (edition.verification === 'verified' && !edition.isbn13 && !edition.jan) failures.push(`verified edition lacks ISBN/JAN: ${edition.edition_id}`);
  if (edition.verification === 'verified_without_isbn' && !edition.source_url) failures.push(`ISBN-less verified edition lacks source URL: ${edition.edition_id}`);
  if (edition.source_url && !edition.source_url.startsWith('https://')) failures.push(`non-HTTPS source URL: ${edition.edition_id}`);
  if (edition.id_kind === 'asin') {
    if (!/^[A-Z0-9]{10}$/.test(edition.asin ?? '')) failures.push(`invalid ASIN edition: ${edition.edition_id}`);
    if (edition.edition_id !== `asin:${edition.asin}`) failures.push(`ASIN edition ID mismatch: ${edition.edition_id}`);
    if (edition.format !== 'Kindle') failures.push(`ASIN edition is not Kindle: ${edition.edition_id}`);
    if (edition.metadata_source !== 'kindle_xml') failures.push(`ASIN edition lacks kindle_xml provenance: ${edition.edition_id}`);
  }
  if (edition.verification_sources) {
    const providers = edition.verification_sources.map((source) => source.provider).filter(Boolean);
    if (new Set(providers).size < 2) failures.push(`automated ISBN lacks two providers: ${edition.edition_id}`);
    for (const source of edition.verification_sources) {
      if (source.url && !source.url.startsWith('https://')) failures.push(`non-HTTPS verification source: ${edition.edition_id}`);
    }
  }
}
for (const holding of catalog.holdings) {
  if (!workIds.has(holding.work_id)) failures.push(`orphan holding work: ${holding.holding_id}`);
  if (holding.edition_id && !editionIds.has(holding.edition_id)) failures.push(`orphan holding edition: ${holding.holding_id}`);
}
const isbnValues = catalog.editions.map((edition) => edition.isbn13).filter(Boolean);
if (!unique(isbnValues)) failures.push('duplicate ISBN-13');
const asinValues = catalog.editions.filter((edition) => edition.id_kind === 'asin').map((edition) => edition.asin);
if (!unique(asinValues)) failures.push('duplicate ASIN edition');
if (catalog.stats.work_count !== catalog.works.length) failures.push('work_count mismatch');
if (catalog.stats.edition_count !== catalog.editions.length) failures.push('edition_count mismatch');
if (catalog.stats.holding_count !== catalog.holdings.length) failures.push('holding_count mismatch');
if (catalog.stats.input_count !== catalog.works.reduce((sum, work) => sum + work.item_count, 0)) failures.push('input_count mismatch');

const issueRecords = catalog.issue_records ?? [];
const ordinals = issueRecords.map((record) => record.ordinal);
if (issueRecords.length !== 60) failures.push(`Issue #1 record count is ${issueRecords.length}, expected 60`);
if (JSON.stringify([...ordinals].sort((a, b) => a - b)) !== JSON.stringify(Array.from({ length: 60 }, (_, index) => index + 1))) failures.push('Issue #1 ordinals are incomplete or duplicated');
for (const record of issueRecords) {
  if (!workIds.has(record.work_id)) failures.push(`Issue #1 record has no work: ${record.ordinal}`);
  if (record.title_key !== titleKey(record.work_title)) failures.push(`Issue #1 title key mismatch: ${record.ordinal}`);
}
const forbiddenKeys = new Set(['title_raw', 'raw_title', 'original_title', 'source_text']);
function scanForbidden(value, path = '$') {
  if (Array.isArray(value)) return value.forEach((item, index) => scanForbidden(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) failures.push(`raw/original field is forbidden: ${path}.${key}`);
    scanForbidden(child, `${path}.${key}`);
  }
}
scanForbidden(issueRecords);

if (catalog.stats.issue_1_record_count !== 60) failures.push('Issue #1 stats record count mismatch');
if (catalog.stats.issue_1_duplicate_skipped_count !== 24) failures.push('Issue #1 duplicate skip count mismatch');
if (catalog.stats.issue_1_added_record_count !== 36) failures.push('Issue #1 added record count mismatch');
if (catalog.stats.issue_1_new_work_count !== 35) failures.push('Issue #1 new work count mismatch');

const kindleRecords = catalog.kindle_records ?? [];
const kindleItems = catalog.kindle_items ?? [];
const acquisitions = catalog.acquisitions ?? [];
const kindleAudit = catalog.kindle_match_audit ?? [];
if (kindleRecords.length || kindleItems.length || acquisitions.length || kindleAudit.length) {
  if (!unique(kindleRecords.map((record) => record.ordinal))) failures.push('Kindle record ordinal is not unique');
  if (!unique(kindleItems.map((item) => item.asin))) failures.push('Kindle item ASIN is not unique');
  if (!unique(acquisitions.map((item) => item.acquisition_id))) failures.push('Kindle acquisition_id is not unique');
  if (catalog.stats.kindle_record_count !== kindleRecords.length) failures.push('kindle_record_count mismatch');
  if (catalog.stats.kindle_unique_asin_count !== kindleItems.length) failures.push('kindle_unique_asin_count mismatch');
  if (catalog.stats.kindle_purchase_record_count !== kindleRecords.filter((record) => record.origin_type === 'purchase').length) failures.push('kindle_purchase_record_count mismatch');
  if (catalog.stats.kindle_sample_record_count !== kindleRecords.filter((record) => record.origin_type === 'sample').length) failures.push('kindle_sample_record_count mismatch');
  if (catalog.stats.kindle_prime_record_count !== kindleRecords.filter((record) => record.origin_type === 'prime').length) failures.push('kindle_prime_record_count mismatch');
  if (acquisitions.length !== kindleRecords.length) failures.push('every Kindle source record must have one acquisition');

  const purchaseAsins = new Set(kindleRecords.filter((record) => record.origin_type === 'purchase').map((record) => record.asin));
  const kindleHoldings = catalog.holdings.filter((holding) => holding.source === 'Amazon Kindle XML');
  const holdingAsins = new Set(kindleHoldings.map((holding) => holding.edition_id?.replace(/^asin:/, '')));
  if (kindleHoldings.length !== purchaseAsins.size) failures.push('Kindle holding count must equal unique purchased ASIN count');
  for (const asin of purchaseAsins) {
    if (!holdingAsins.has(asin)) failures.push(`purchased ASIN lacks holding: ${asin}`);
    if (!editionIds.has(`asin:${asin}`)) failures.push(`purchased ASIN lacks edition: ${asin}`);
  }
  for (const asin of holdingAsins) {
    if (!purchaseAsins.has(asin)) failures.push(`non-purchased ASIN became a holding: ${asin}`);
  }
  for (const acquisition of acquisitions) {
    if (acquisition.provider !== 'amazon_kindle') failures.push(`invalid acquisition provider: ${acquisition.acquisition_id}`);
    if (acquisition.owned !== (acquisition.acquisition_type === 'purchase')) failures.push(`acquisition owned flag mismatch: ${acquisition.acquisition_id}`);
    if (acquisition.work_id && !workIds.has(acquisition.work_id)) failures.push(`orphan acquisition work: ${acquisition.acquisition_id}`);
    if (acquisition.edition_id && !editionIds.has(acquisition.edition_id)) failures.push(`orphan acquisition edition: ${acquisition.acquisition_id}`);
  }
  for (const item of kindleItems) {
    if (item.owned !== item.origin_types.includes('purchase')) failures.push(`Kindle item owned flag mismatch: ${item.asin}`);
    if (item.owned && (!item.work_id || !item.edition_id)) failures.push(`owned Kindle item lacks catalog links: ${item.asin}`);
    if (!item.owned && (item.work_id || item.edition_id)) failures.push(`non-owned Kindle item unexpectedly linked as holding edition: ${item.asin}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`validated ${catalog.works.length} works, ${catalog.editions.length} editions, ${catalog.holdings.length} holdings, ${issueRecords.length} issue records, ${kindleRecords.length} Kindle records`);
