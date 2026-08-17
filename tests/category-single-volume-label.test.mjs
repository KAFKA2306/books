import test from 'node:test';
import assert from 'node:assert/strict';
import { decideCategory } from '../src/category-enrichment.mjs';
import {
  normalizeCategoryLookupTitle,
  normalizeCategorySearchRecords,
} from '../src/category-title-normalization.mjs';

test('removes an explicit 単行本版 retail label and adjacent volume number', () => {
  assert.equal(
    normalizeCategoryLookupTitle('ニューノーマル【単行本版】1 (コミックアウル)'),
    'ニューノーマル',
  );
});

test('separates an NDL Japanese main title from a Latin parallel title', () => {
  assert.equal(
    normalizeCategoryLookupTitle('ニューノーマル = New Normal. 2'),
    'ニューノーマル',
  );
  assert.equal(
    normalizeCategoryLookupTitle('長い数式の本 A = B の意味'),
    '長い数式の本 A = B の意味',
  );
});

test('normalized retail title matches the NDL bibliographic title without lowering acceptance rules', () => {
  const work = {
    work_id: 'wrk_new_normal',
    title: normalizeCategoryLookupTitle('ニューノーマル【単行本版】1 (コミックアウル)'),
    category: '未分類',
  };
  const records = normalizeCategorySearchRecords([{
    title: 'ニューノーマル = New Normal. 2',
    isbns: [],
    ndc: [{ scheme: 'NDC10', code: '726.1' }],
    source_url: 'https://ndlsearch.ndl.go.jp/books/R100000002-I031779084',
  }]);
  const decision = decideCategory(work, records);
  assert.equal(decision.outcome, 'accepted');
  assert.equal(decision.accepted.category, '漫画・コミック');
  assert.equal(decision.accepted.title_similarity, 1);
});
