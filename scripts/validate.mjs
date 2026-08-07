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

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`validated ${catalog.works.length} works, ${catalog.editions.length} editions, ${catalog.holdings.length} holdings, ${issueRecords.length} issue records`);
