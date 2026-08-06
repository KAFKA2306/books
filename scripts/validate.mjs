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

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`validated ${catalog.works.length} works, ${catalog.editions.length} editions, ${catalog.holdings.length} holdings`);
