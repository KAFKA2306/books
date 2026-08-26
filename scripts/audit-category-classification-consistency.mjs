import { loadCatalog } from './load-catalog.mjs';
import { categoryForNdc } from '../src/category-enrichment.mjs';

const catalog = await loadCatalog();
const worksById = new Map(catalog.works.map((work) => [work.work_id, work]));
const mismatches = [];

for (const classification of catalog.classifications ?? []) {
  const work = worksById.get(classification.work_id);
  if (!work) continue;
  const expectedCategory = categoryForNdc(classification.code);
  if (!expectedCategory || work.category === expectedCategory) continue;
  mismatches.push({
    work_id: work.work_id,
    title: work.title,
    current_category: work.category,
    expected_category: expectedCategory,
    ndc_scheme: classification.scheme_id,
    ndc_code: classification.code,
    source_url: classification.source_url ?? null,
  });
}

mismatches.sort((a, b) => a.work_id.localeCompare(b.work_id));

const result = {
  schema: 'kafka.books.category-classification-consistency-audit.v1',
  classified_work_count: new Set((catalog.classifications ?? []).map((row) => row.work_id)).size,
  mismatch_count: mismatches.length,
  mismatches,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`category/classification consistency: ${result.mismatch_count} mismatches across ${result.classified_work_count} classified works`);
  for (const row of mismatches) {
    console.log(`${row.work_id}\t${row.title}\t${row.current_category}\t${row.expected_category}\t${row.ndc_code}`);
  }
}

if (process.argv.includes('--strict') && mismatches.length) process.exitCode = 1;
