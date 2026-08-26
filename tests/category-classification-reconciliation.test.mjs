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

test('clears a confident category when retained classifications disagree', () => {
  const catalog = {
    works: [
      { work_id: 'wrk_1', title: 'ambiguous', category: '科学・技術' },
    ],
    classifications: [
      { work_id: 'wrk_1', scheme_id: 'ndc9', code: '141.93' },
      { work_id: 'wrk_1', scheme_id: 'ndc9', code: '491.371' },
    ],
    stats: {},
  };

  const reconciled = reconcileCategoriesFromClassifications(catalog);
  assert.equal(reconciled.works[0].category, '未分類');
  assert.equal(reconciled.stats.classification_category_reconciled_count, 1);
  assert.equal(reconciled.stats.classification_category_conflict_count, 1);
});
