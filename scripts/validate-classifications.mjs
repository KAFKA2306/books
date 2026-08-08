import { loadCatalog } from './load-catalog.mjs';

const catalog = await loadCatalog();
const failures = [];
const workIds = new Set(catalog.works.map((work) => work.work_id));
const editionIds = new Set(catalog.editions.map((edition) => edition.edition_id));
const schemes = new Set((catalog.classification_schemes ?? []).map((row) => row.scheme_id));
const rows = catalog.classifications ?? [];

if ((catalog.ndc10_main_classes ?? []).length !== 10) failures.push('NDC10 main class registry must contain 10 rows');
if (!schemes.has('ndc10')) failures.push('NDC10 scheme is missing');
if (new Set(rows.map((row) => row.classification_id)).size !== rows.length) failures.push('classification_id is not unique');

for (const row of rows) {
  if (!workIds.has(row.work_id)) failures.push(`orphan classification work: ${row.classification_id}`);
  if (row.edition_id && !editionIds.has(row.edition_id)) failures.push(`orphan classification edition: ${row.classification_id}`);
  if (!schemes.has(row.scheme_id)) failures.push(`unknown classification scheme: ${row.classification_id}`);
  if (!/^\d{3}(?:\.\d+)?$/.test(row.code)) failures.push(`invalid NDC code: ${row.classification_id}`);
  if (row.scheme_id === 'ndc10') {
    if (row.main_class_code !== row.code[0]) failures.push(`NDC10 main class mismatch: ${row.classification_id}`);
    if (!row.main_class_label) failures.push(`NDC10 main class label missing: ${row.classification_id}`);
  }
  if (row.verification !== 'source_reported') failures.push(`classification verification mismatch: ${row.classification_id}`);
  if (row.source_url && !row.source_url.startsWith('https://')) failures.push(`classification source URL is not HTTPS: ${row.classification_id}`);
}

if (catalog.stats.classification_record_count !== rows.length) failures.push('classification_record_count mismatch');
if (catalog.stats.classified_work_count !== new Set(rows.map((row) => row.work_id)).size) failures.push('classified_work_count mismatch');
if (catalog.stats.ndc10_classified_work_count !== new Set(rows.filter((row) => row.scheme_id === 'ndc10').map((row) => row.work_id)).size) failures.push('ndc10_classified_work_count mismatch');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`validated ${rows.length} standard classification records`);
