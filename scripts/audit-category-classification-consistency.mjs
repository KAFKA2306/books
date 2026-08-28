import { loadCatalog } from './load-catalog.mjs';
import { categoryForNdc } from '../src/category-enrichment.mjs';

const catalog = await loadCatalog();
const classificationsByWork = new Map();
for (const classification of catalog.classifications ?? []) {
  const rows = classificationsByWork.get(classification.work_id) ?? [];
  rows.push(classification);
  classificationsByWork.set(classification.work_id, rows);
}

function isEditionVariation(rows, expectedCategories) {
  if (expectedCategories.length <= 1) return false;
  const sourceIsbns = rows.map((row) => row.source_isbn13).filter(Boolean);
  return sourceIsbns.length === rows.length && new Set(sourceIsbns).size === rows.length;
}

const mismatches = [];
const conflicts = [];
const editionVariations = [];
for (const work of catalog.works ?? []) {
  const rows = classificationsByWork.get(work.work_id) ?? [];
  const expectedCategories = [...new Set(rows.map((row) => categoryForNdc(row.code)).filter(Boolean))];
  if (!expectedCategories.length) continue;

  if (expectedCategories.length > 1) {
    const detail = {
      work_id: work.work_id,
      title: work.title,
      current_category: work.category,
      expected_categories: expectedCategories.sort(),
      classifications: rows.map((row) => ({
        ndc_scheme: row.scheme_id,
        ndc_code: row.code,
        source_url: row.source_url ?? null,
        source_isbn13: row.source_isbn13 ?? null,
      })),
    };
    if (isEditionVariation(rows, expectedCategories)) editionVariations.push(detail);
    else conflicts.push(detail);
    continue;
  }

  const [expectedCategory] = expectedCategories;
  if (work.category === expectedCategory) continue;
  mismatches.push({
    work_id: work.work_id,
    title: work.title,
    current_category: work.category,
    expected_category: expectedCategory,
    classifications: rows.map((row) => ({
      ndc_scheme: row.scheme_id,
      ndc_code: row.code,
      source_url: row.source_url ?? null,
      source_isbn13: row.source_isbn13 ?? null,
    })),
  });
}

mismatches.sort((a, b) => a.work_id.localeCompare(b.work_id));
conflicts.sort((a, b) => a.work_id.localeCompare(b.work_id));
editionVariations.sort((a, b) => a.work_id.localeCompare(b.work_id));

const result = {
  schema: 'kafka.books.category-classification-consistency-audit.v1',
  classified_work_count: classificationsByWork.size,
  mismatch_count: mismatches.length,
  conflict_count: conflicts.length,
  edition_variation_count: editionVariations.length,
  mismatches,
  conflicts,
  edition_variations: editionVariations,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`category/classification consistency: ${result.mismatch_count} mismatches, ${result.conflict_count} source conflicts, ${result.edition_variation_count} edition variations across ${result.classified_work_count} classified works`);
  for (const row of mismatches) {
    console.log(`${row.work_id}\t${row.title}\t${row.current_category}\t${row.expected_category}`);
  }
  for (const row of conflicts) {
    console.log(`${row.work_id}\t${row.title}\t${row.current_category}\tCONFLICT\t${row.expected_categories.join('|')}`);
  }
  for (const row of editionVariations) {
    console.log(`${row.work_id}\t${row.title}\t${row.current_category}\tEDITION_VARIATION\t${row.expected_categories.join('|')}`);
  }
}

if (process.argv.includes('--strict') && mismatches.length) process.exitCode = 1;
