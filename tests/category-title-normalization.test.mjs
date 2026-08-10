import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCategoryLookupTitle,
  normalizeCategorySearchRecords,
} from '../src/category-title-normalization.mjs';
import { decideCategory } from '../src/category-enrichment.mjs';

test('removes only trailing bibliographic volume and series decorations', () => {
  assert.equal(
    normalizeCategoryLookupTitle('ボールルームへようこそ(1) (月刊少年マガジンコミックス)'),
    'ボールルームへようこそ',
  );
  assert.equal(
    normalizeCategoryLookupTitle('ゆゆ式 3巻 (まんがタイムKRコミックス)'),
    'ゆゆ式',
  );
  assert.equal(
    normalizeCategoryLookupTitle('中国の行動原理 国内潮流が決める国際関係 (中公新書)'),
    '中国の行動原理 国内潮流が決める国際関係',
  );
});

test('keeps meaningful parenthetical title text', () => {
  assert.equal(
    normalizeCategoryLookupTitle('「死」とは何か (イェール大学で23年連続の人気講義)'),
    '「死」とは何か (イェール大学で23年連続の人気講義)',
  );
});

test('normalized title comparison still fails closed on conflicting NDC categories', () => {
  const work = {
    work_id: 'wrk_manga',
    title: normalizeCategoryLookupTitle('ボールルームへようこそ(1) (月刊少年マガジンコミックス)'),
    category: '未分類',
  };
  const records = normalizeCategorySearchRecords([
    {
      title: 'ボールルームへようこそ 1巻 (講談社コミックス)',
      isbns: [],
      ndc: [{ scheme: 'NDC10', code: '726.1' }],
      source_url: 'https://ndlsearch.ndl.go.jp/books/a',
    },
    {
      title: 'ボールルームへようこそ(1) (ゲームシリーズ)',
      isbns: [],
      ndc: [{ scheme: 'NDC10', code: '798.3' }],
      source_url: 'https://ndlsearch.ndl.go.jp/books/b',
    },
  ]);
  const decision = decideCategory(work, records);
  assert.equal(decision.outcome, 'ambiguous');
});

test('normalized title comparison accepts one NDL NDC category without lowering threshold', () => {
  const work = {
    work_id: 'wrk_manga',
    title: normalizeCategoryLookupTitle('さよなら絶望先生(3) (週刊少年マガジンコミックス)'),
    category: '未分類',
  };
  const records = normalizeCategorySearchRecords([{
    title: 'さよなら絶望先生 3巻 (講談社コミックス)',
    isbns: [],
    ndc: [{ scheme: 'NDC10', code: '726.1' }],
    source_url: 'https://ndlsearch.ndl.go.jp/books/example',
  }]);
  const decision = decideCategory(work, records);
  assert.equal(decision.outcome, 'accepted');
  assert.equal(decision.accepted.category, '漫画・コミック');
  assert.equal(decision.accepted.title_similarity, 1);
});
