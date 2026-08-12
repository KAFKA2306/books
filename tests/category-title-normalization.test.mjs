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
  assert.equal(normalizeCategoryLookupTitle('ゆゆ式 3巻 (まんがタイムKRコミックス)'), 'ゆゆ式');
  assert.equal(
    normalizeCategoryLookupTitle('中国の行動原理 国内潮流が決める国際関係 (中公新書)'),
    '中国の行動原理 国内潮流が決める国際関係',
  );
});

test('removes known Kindle retail decorations before NDL lookup', () => {
  assert.equal(
    normalizeCategoryLookupTitle('ゆらぎ荘の幽奈さん【期間限定無料】 1 (ジャンプコミックスDIGITAL)'),
    'ゆらぎ荘の幽奈さん',
  );
  assert.equal(
    normalizeCategoryLookupTitle('食戟のソーマ【期間限定無料】 1 (ジャンプコミックスDIGITAL)'),
    '食戟のソーマ',
  );
  assert.equal(
    normalizeCategoryLookupTitle('いちご100% モノクロ版【期間限定無料】 1 (ジャンプコミックスDIGITAL)'),
    'いちご100%',
  );
  assert.equal(normalizeCategoryLookupTitle('しゃばけ【しゃばけシリーズ第1弾】'), 'しゃばけ');
});

test('removes explicit retailer edition labels without guessing bibliographic content', () => {
  assert.equal(normalizeCategoryLookupTitle('Pro Git (English Edition)'), 'Pro Git');
  assert.equal(normalizeCategoryLookupTitle('統計学入門 (Kindle版)'), '統計学入門');
  assert.equal(normalizeCategoryLookupTitle('統計学入門 (電子書籍版)'), '統計学入門');
  assert.equal(
    normalizeCategoryLookupTitle(
      'Foundations of Quantum Theory (Fundamental Theories of Physics Book 188) (English Edition)',
    ),
    'Foundations of Quantum Theory',
  );
});

test('normalizes bibliographic subtitle separators to the stable main title', () => {
  assert.equal(
    normalizeCategoryLookupTitle('13歳からの地政学 : カイゾクとの地球儀航海'),
    '13歳からの地政学',
  );
  assert.equal(
    normalizeCategoryLookupTitle('13歳からの地政学―カイゾクとの地球儀航海'),
    '13歳からの地政学',
  );
  assert.equal(
    normalizeCategoryLookupTitle('インデックス投資は勝者のゲーム ──株式市場から利益を得る常識的方法'),
    'インデックス投資は勝者のゲーム',
  );
  assert.equal(normalizeCategoryLookupTitle('AI:未来'), 'AI:未来');
  assert.equal(normalizeCategoryLookupTitle('AI―未来'), 'AI―未来');
});

test('does not strip a bare trailing number without known retail or bibliographic context', () => {
  assert.equal(normalizeCategoryLookupTitle('プロジェクト 2025'), 'プロジェクト 2025');
  assert.equal(normalizeCategoryLookupTitle('2001'), '2001');
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

test('observed retailer dash title matches the NDL main title without lowering threshold', () => {
  const work = {
    work_id: 'wrk_13sai',
    title: normalizeCategoryLookupTitle('13歳からの地政学―カイゾクとの地球儀航海'),
    category: '未分類',
  };
  const records = normalizeCategorySearchRecords([{
    title: '13歳からの地政学 : カイゾクとの地球儀航海',
    isbns: ['9784492444689'],
    ndc: [{ scheme: 'NDC10', code: '312.9' }],
    source_url: 'https://ndlsearch.ndl.go.jp/books/R100000002-I031980944',
  }]);
  const decision = decideCategory(work, records);
  assert.equal(decision.outcome, 'accepted');
  assert.equal(decision.accepted.category, '政治');
  assert.equal(decision.accepted.title_similarity, 1);
});
