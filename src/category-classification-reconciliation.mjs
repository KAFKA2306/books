import { categoryForNdc } from './category-enrichment.mjs';

function isEditionVariation(rows, categories) {
  if (categories.size <= 1) return false;
  const sourceIsbns = rows.map((row) => row.source_isbn13).filter(Boolean);
  return sourceIsbns.length === rows.length && new Set(sourceIsbns).size === rows.length;
}

export function reconcileCategoriesFromClassifications(catalog) {
  const rowsByWork = new Map();
  for (const classification of catalog.classifications ?? []) {
    const expectedCategory = categoryForNdc(classification.code);
    if (!expectedCategory) continue;
    const rows = rowsByWork.get(classification.work_id) ?? [];
    rows.push({ classification, expectedCategory });
    rowsByWork.set(classification.work_id, rows);
  }

  let reconciled = 0;
  let conflicts = 0;
  let editionVariations = 0;
  const works = (catalog.works ?? []).map((work) => {
    const rows = rowsByWork.get(work.work_id) ?? [];
    if (!rows.length) return work;
    const categories = new Set(rows.map((row) => row.expectedCategory));

    if (categories.size > 1) {
      if (isEditionVariation(rows.map((row) => row.classification), categories)) {
        editionVariations += 1;
        if (categories.has(work.category)) return work;
        if (work.category === '未分類') return work;
        reconciled += 1;
        return { ...work, category: '未分類' };
      }

      conflicts += 1;
      if (work.category === '未分類') return work;
      reconciled += 1;
      return { ...work, category: '未分類' };
    }

    const [expectedCategory] = categories;
    if (work.category === expectedCategory) return work;
    reconciled += 1;
    return { ...work, category: expectedCategory };
  });

  return {
    ...catalog,
    works,
    stats: {
      ...catalog.stats,
      classification_category_reconciled_count: reconciled,
      classification_category_conflict_count: conflicts,
      classification_category_edition_variation_count: editionVariations,
    },
  };
}
