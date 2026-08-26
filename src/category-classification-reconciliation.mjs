import { categoryForNdc } from './category-enrichment.mjs';

export function reconcileCategoriesFromClassifications(catalog) {
  const expectedByWork = new Map();

  for (const classification of catalog.classifications ?? []) {
    const expectedCategory = categoryForNdc(classification.code);
    if (!expectedCategory) continue;
    const categories = expectedByWork.get(classification.work_id) ?? new Set();
    categories.add(expectedCategory);
    expectedByWork.set(classification.work_id, categories);
  }

  let reconciled = 0;
  let conflicts = 0;
  const works = (catalog.works ?? []).map((work) => {
    const categories = expectedByWork.get(work.work_id);
    if (!categories?.size) return work;
    if (categories.size !== 1) {
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
    },
  };
}
