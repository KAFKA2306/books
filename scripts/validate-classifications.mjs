import { loadCatalog } from './load-catalog.mjs';

const catalog = await loadCatalog();
const failures = [];
const workIds = new Set(catalog.works.map((work) => work.work_id));
const editionIds = new Set(catalog.editions.map((edition) => edition.edition_id));
const schemes = new Map((catalog.classification_schemes ?? []).map((row) => [row.scheme_id, row]));
const classifications = catalog.classifications ?? [];
const ids = classifications.map((row) => row.classification_id);

if (new Set(ids).size !== ids.length) failures.push('classification_id is not unique');
if (!schemes.has('ndc10')) failures.push('NDC10 scheme is missing');
if (schemes.get('ndc10')?.role !== 'primary') failures.push('NDC10 must be primary');
if ((catalog.ndc10_main_classes ?? []).length !== 10) failures.push('NDC10 main classes must contain 10 rows');

for (const row of classifications) {
  if (!workIds.has(row.work_id)) failures.push(`orphan classification work: ${row.classification_id}`);
  if (!editionIds.has(row.edition_id)) failures.push(`orphan classification edition: ${row.classification_id}`);
  if (!schemes.has(row.scheme_id)) failures.push(`unknown classification scheme: ${row.classification_id}`);
  if (!row.code) failures.push(`classification code missing: ${row.classification_id}`);
  if (row.source_provider !== 'ndl_search') failures.push(`unsupported classification source: ${row.classification_id}`);
  if (!String(row.source_url ?? '').startsWith('https://ndlsearch.ndl.go.jp/')) failures.push(`classification source URL invalid: ${row.classification_id}`);
  if (row.verification !== 'source_reported') failures.push(`classification verification invalid: ${row.classification_id}`);
  if (row.scheme_id === 'ndc10') {
    if (!/^\d{1,3}(?:\.\d+)?$/.test(row.code)) failures.push(`invalid NDC10 code: ${row.classification_id}`);
    if (row.main_class_code !== row.code[0]) failures.push(`NDC10 main class mismatch: ${row.classification_id}`);
  }
}

if (catalog.stats.classification_record_count !== classifications.length) failures.push('classification_record_count mismatch');
const classifiedWorks = new Set(classifications.map((row) => row.work_id));
const ndc10Works = new Set(classifications.filter((row) => row.scheme_id === 'ndc10').map((row) => row.work_id));
if (catalog.stats.classified_work_count !== classifiedWorks.size) failures.push('classified_work_count mismatch');
if (catalog.stats.ndc10_classified_work_count !== ndc10Works.size) failures.push('ndc10_classified_work_count mismatch');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`validated ${classifications.length} classification records across ${classifiedWorks.size} works`);
