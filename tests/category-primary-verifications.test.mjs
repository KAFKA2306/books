import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../scripts/load-catalog.mjs';

test('primary NDL category verification is current-use and source-reported', async () => {
  const catalog = await loadCatalog();
  const work = catalog.works.find((item) => item.work_id === 'wrk_012b6febd3c5');
  assert.ok(work, 'missing deep-learning work');
  assert.equal(work.category, 'コンピュータ・AI');
  assert.equal(
    work.classification?.source_url,
    'https://ndlsearch.ndl.go.jp/books/R100000002-I028568441',
  );
  assert.equal(work.classification?.match_mode, 'primary_bibliographic_record');

  const classification = catalog.classifications.find((item) => (
    item.work_id === 'wrk_012b6febd3c5'
    && item.scheme_id === 'ndc10'
    && item.code === '007.13'
  ));
  assert.ok(classification, 'missing deep-learning NDC10 classification');
  assert.equal(
    classification.source_url,
    'https://ndlsearch.ndl.go.jp/books/R100000002-I028568441',
  );
  assert.equal(classification.verification, 'source_reported');
});
