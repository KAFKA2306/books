import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_RULE_VERSION,
  applyCategoryEnrichments,
  categoryForNdc,
  decideCategory,
  normalizeNdcCode,
  parseNdlCategorySearch,
} from '../src/category-enrichment.mjs';

test('normalizes NDC codes and maps explicit KAFKA categories', () => {
  assert.equal(normalizeNdcCode('7.64'), '007.64');
  assert.equal(normalizeNdcCode('338.155'), '338.155');
  assert.equal(categoryForNdc('007.64'), 'コンピュータ・AI');
  assert.equal(categoryForNdc('338.155'), '投資・金融');
  assert.equal(categoryForNdc('448.9'), '地図・測地');
  assert.equal(categoryForNdc('547.48'), '情報通信・ネットワーク');
  assert.equal(categoryForNdc('726.1'), '漫画・コミック');
  assert.equal(categoryForNdc('491.8'), '医学・健康');
  assert.equal(categoryForNdc('913.6'), '文学・小説');
});

test('parses NDC10 URI and ISBN from NDL OpenSearch item', () => {
  const xml = `
    <rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <channel><item>
        <title>自分のアタマで考えよう : 知識にだまされない思考の技術</title>
        <dc:identifier xsi:type="dcndl:ISBN">9784478017036</dc:identifier>
        <dcterms:subject rdf:resource="http://id.ndl.go.jp/class/ndc10/336" />
        <link>https://ndlsearch.ndl.go.jp/books/R100000002-I000011305840</link>
      </item></channel>
    </rss>`;
  const records = parseNdlCategorySearch(xml);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].isbns, ['9784478017036']);
  assert.deepEqual(records[0].ndc, [{ scheme: 'NDC10', code: '336' }]);
});

test('parses literal NDC datatype', () => {
  const xml = `
    <rss xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item>
      <title>ネットワークはなぜつながるのか</title>
      <dc:subject rdf:datatype="http://ndl.go.jp/dcndl/terms/NDC9">547.48</dc:subject>
      <link>https://ndlsearch.ndl.go.jp/books/example</link>
    </item></channel></rss>`;
  const records = parseNdlCategorySearch(xml);
  assert.deepEqual(records[0].ndc, [{ scheme: 'NDC9', code: '547.48' }]);
});

test('prefers exact ISBN evidence and maps one deterministic category', () => {
  const work = { work_id: 'wrk_test', title: '自分のアタマで考えよう', category: '未分類' };
  const records = [{
    title: '自分のアタマで考えよう : 知識にだまされない思考の技術',
    authors: ['ちきりん'],
    isbns: ['9784478017036'],
    ndc: [{ scheme: 'NDC10', code: '336' }],
    source_url: 'https://ndlsearch.ndl.go.jp/books/example',
  }];
  const decision = decideCategory(work, records, { isbn13s: ['9784478017036'] });
  assert.equal(decision.outcome, 'accepted');
  assert.equal(decision.accepted.category, '経営・会計');
  assert.equal(decision.accepted.match_mode, 'isbn');
});

test('accepts sufficiently long title contained at a bibliographic boundary', () => {
  const work = { work_id: 'wrk_test', title: 'はやぶさの超技術', category: '未分類' };
  const records = [{
    title: '小惑星探査機「はやぶさ」の超技術',
    isbns: [],
    ndc: [{ scheme: 'NDC9', code: '538.94' }],
    source_url: 'https://ndlsearch.ndl.go.jp/books/R100000002-I000011156764',
  }];
  const decision = decideCategory(work, records);
  assert.equal(decision.outcome, 'accepted');
  assert.equal(decision.accepted.category, '機械工学');
  assert.equal(decision.accepted.match_mode, 'title_containment');
  assert.ok(decision.accepted.title_similarity < 0.97);
});

test('rejects short title containment', () => {
  const work = { work_id: 'wrk_test', title: 'ある男', category: '未分類' };
  const records = [{
    title: 'ある男の秘密',
    isbns: [],
    ndc: [{ scheme: 'NDC10', code: '913.6' }],
    source_url: 'https://ndlsearch.ndl.go.jp/books/example',
  }];
  const decision = decideCategory(work, records);
  assert.equal(decision.outcome, 'no_candidate');
});

test('rejects title matches when NDC categories conflict', () => {
  const work = { work_id: 'wrk_test', title: '同じ本', category: '未分類' };
  const records = [
    { title: '同じ本', isbns: [], ndc: [{ scheme: 'NDC10', code: '338' }], source_url: 'https://ndlsearch.ndl.go.jp/books/a' },
    { title: '同じ本', isbns: [], ndc: [{ scheme: 'NDC10', code: '007' }], source_url: 'https://ndlsearch.ndl.go.jp/books/b' },
  ];
  const decision = decideCategory(work, records);
  assert.equal(decision.outcome, 'ambiguous');
});

test('overlay changes only 未分類 works, derives category from NDC, and keeps provenance', () => {
  const catalog = {
    stats: {},
    works: [
      { work_id: 'wrk_a', title: 'A', category: '未分類' },
      { work_id: 'wrk_b', title: 'B', category: '投資・金融' },
      { work_id: 'wrk_map', title: 'Map', category: '未分類' },
    ],
    editions: [],
    holdings: [],
  };
  const overlay = {
    records: [
      {
        work_id: 'wrk_a', category: 'コンピュータ・AI', ndc_scheme: 'NDC10', ndc_code: '007.64',
        source_url: 'https://ndlsearch.ndl.go.jp/books/a', match_mode: 'title', title_similarity: 1,
        rule_version: CATEGORY_RULE_VERSION, verified_at: '2026-08-08T00:00:00.000Z',
      },
      {
        work_id: 'wrk_b', category: 'コンピュータ・AI', ndc_scheme: 'NDC10', ndc_code: '007.64',
        source_url: 'https://ndlsearch.ndl.go.jp/books/b', match_mode: 'title', title_similarity: 1,
        rule_version: CATEGORY_RULE_VERSION, verified_at: '2026-08-08T00:00:00.000Z',
      },
      {
        work_id: 'wrk_map', category: '天文・宇宙', ndc_scheme: 'NDC10', ndc_code: '448.9',
        source_url: 'https://ndlsearch.ndl.go.jp/books/map', match_mode: 'isbn', title_similarity: 1,
        rule_version: CATEGORY_RULE_VERSION, verified_at: '2026-08-08T00:00:00.000Z',
      },
    ],
  };
  const result = applyCategoryEnrichments(catalog, overlay);
  assert.equal(result.works[0].category, 'コンピュータ・AI');
  assert.equal(result.works[0].classification.source, 'ndl_search');
  assert.equal(result.works[1].category, '投資・金融');
  assert.equal(result.works[2].category, '地図・測地');
  assert.equal(result.stats.category_enriched_count, 2);
});
