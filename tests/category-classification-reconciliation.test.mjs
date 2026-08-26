import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileCategoriesFromClassifications } from '../src/category-classification-reconciliation.mjs';

test('reconciles a stale category when retained NDC evidence maps uniquely', () => {
  const catalog = {
    works: [
      { work_id: 'wrk_1', title: '論理的思考とは何か', category: 'ゲーム・戦略' },
    ],
    classifications: [
      { work_id: 'wrk_1', scheme_id: 'ndc10', code: '116.1' },
    ],
    stats: {},
  };

  const reconciled = reconcileCategoriesFromClassifications(catalog);
  assert.equal(reconciled.works[0].category, '哲学・思想');
  assert.equal(reconciled.stats.classification_category_reconciled_count, 1);
  assert.equal(reconciled.stats.classification_category_conflict_count, 0);
});

test('does not guess when merged classifications imply multiple categories', () => {
  const catalog = {
    works: [
      { work_id: 'wrk_1', title: 'ambiguous', category: '未分類' },
    ],
    classifications: [
      { work_id: 'wrk_1', scheme_id: 'ndc10', code: '116.1' },
      { work_id: 'wrk_1', scheme_id: 'ndc10', code: '417' },
    ],
    stats: {},
  };

  const reconciled = reconcileCategoriesFromClassifications(catalog);
  assert.equal(reconciled.works[0].category, '未分類');
  assert.equal(reconciled.stats.classification_category_reconciled_count, 0);
  assert.equal(reconciled.stats.classification_category_conflict_count, 1);
});
