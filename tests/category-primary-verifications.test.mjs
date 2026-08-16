import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../scripts/load-catalog.mjs';

test('primary NDL category verifications are current-use and source-reported', async () => {
  const catalog = await loadCatalog();
  const expected = [
    {
      workId: 'wrk_012b6febd3c5',
      category: 'コンピュータ・AI',
      scheme: 'ndc10',
      code: '007.13',
      sourceUrl: 'https://ndlsearch.ndl.go.jp/books/R100000002-I028568441',
    },
    {
      workId: 'wrk_061c2026e958',
      category: '政治',
      scheme: 'ndc10',
      code: '316.8',
      sourceUrl: 'https://ndlsearch.ndl.go.jp/books/R100000002-I030339360',
    },
  ];

  for (const row of expected) {
    const work = catalog.works.find((item) => item.work_id === row.workId);
    assert.ok(work, `missing work ${row.workId}`);
    assert.equal(work.category, row.category);
    assert.equal(work.classification?.source_url, row.sourceUrl);
    assert.equal(work.classification?.match_mode, 'primary_bibliographic_record');

    const classification = catalog.classifications.find((item) => (
      item.work_id === row.workId && item.scheme_id === row.scheme && item.code === row.code
    ));
    assert.ok(classification, `missing classification ${row.workId}`);
    assert.equal(classification.source_url, row.sourceUrl);
    assert.equal(classification.verification, 'source_reported');
  }
});
