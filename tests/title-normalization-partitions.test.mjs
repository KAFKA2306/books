import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, mergeTitleNormalizationOverlays } from '../scripts/load-catalog.mjs';
import { applyTitleNormalizations } from '../src/title-normalization.mjs';

test('partitioned title normalization and primary category evidence are applied together', async () => {
  const catalog = await loadCatalog();
  const work = catalog.works.find((item) => item.work_id === 'wrk_fd64415da0cd');
  assert.ok(work, 'missing Guns, Germs, and Steel work');
  assert.equal(work.title, '銃・病原菌・鉄');
  assert.equal(work.author, 'ジャレド・ダイアモンド');
  assert.equal(work.category, '社会・人間関係');

  const classification = catalog.classifications.find((item) => (
    item.work_id === 'wrk_fd64415da0cd'
    && item.scheme_id === 'ndc'
    && item.code === '361.5'
  ));
  assert.ok(classification, 'missing source-reported NDC 361.5 classification');
  assert.equal(
    classification.source_url,
    'https://ndlsearch.ndl.go.jp/books/R100000002-I000002926200',
  );
  assert.equal(classification.verification, 'source_reported');
});

test('duplicate title normalizations remain fail-closed across partitions', () => {
  const catalog = {
    works: [{ work_id: 'wrk_duplicate', title: '誤記', title_key: '誤記', author: null }],
  };
  const overlay = mergeTitleNormalizationOverlays(
    {
      schema: 'kafka.books.title-normalizations.v1',
      records: [{
        work_id: 'wrk_duplicate',
        from_title: '誤記',
        title: '正記',
        source_url: 'https://example.com/a',
      }],
    },
    {
      schema: 'kafka.books.title-normalizations.v1',
      records: [{
        work_id: 'wrk_duplicate',
        from_title: '誤記',
        title: '別表記',
        source_url: 'https://example.com/b',
      }],
    },
  );
  assert.throws(
    () => applyTitleNormalizations(catalog, overlay),
    /duplicate title normalization: wrk_duplicate/,
  );
});

test('malformed title normalization partitions are rejected instead of silently ignored', () => {
  assert.throws(
    () => mergeTitleNormalizationOverlays({
      schema_version: 'kafka.books.title-normalizations.v1',
      normalizations: [],
    }),
    /invalid title normalization partition schema: missing/,
  );
});
