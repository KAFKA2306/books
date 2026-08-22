import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, mergeCategoryOverlays } from '../scripts/load-catalog.mjs';

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

test('partitioned primary NDL evidence is loaded into the canonical catalog', async () => {
  const catalog = await loadCatalog();
  const cases = [
    {
      workId: 'wrk_9fed66931313',
      schemeId: 'ndc10',
      sourceUrl: 'https://ndlsearch.ndl.go.jp/books/R100000002-I030575495',
    },
    {
      workId: 'wrk_facbbdc12286',
      schemeId: 'ndc9',
      sourceUrl: 'https://ndlsearch.ndl.go.jp/books/R100000002-I025373800',
    },
  ];

  for (const { workId, schemeId, sourceUrl } of cases) {
    const work = catalog.works.find((item) => item.work_id === workId);
    assert.ok(work, `missing partitioned work ${workId}`);
    assert.equal(work.category, '漫画・コミック');
    assert.equal(work.classification?.source_url, sourceUrl);
    assert.equal(work.classification?.match_mode, 'primary_bibliographic_record');

    const classification = catalog.classifications.find((item) => (
      item.work_id === workId
      && item.scheme_id === schemeId
      && item.code === '726.1'
    ));
    assert.ok(classification, `missing partitioned NDC classification for ${workId}`);
    assert.equal(classification.source_url, sourceUrl);
    assert.equal(classification.verification, 'source_reported');
  }
});

test('primary evidence wins when automated evidence reports the same classification', () => {
  const automated = {
    records: [{
      work_id: 'wrk_same', category: 'コンピュータ・AI', ndc_scheme: 'NDC10', ndc_code: '007.13',
      match_mode: 'title_containment', source_url: 'https://ndlsearch.ndl.go.jp/books/automated',
    }],
  };
  const primary = {
    records: [{
      work_id: 'wrk_same', category: 'コンピュータ・AI', ndc_scheme: 'NDC10', ndc_code: '007.13',
      match_mode: 'primary_bibliographic_record', source_url: 'https://ndlsearch.ndl.go.jp/books/primary',
    }],
  };
  const merged = mergeCategoryOverlays(automated, primary);
  assert.equal(merged.records.length, 1);
  assert.equal(merged.records[0].match_mode, 'primary_bibliographic_record');
  assert.equal(merged.records[0].source_url, 'https://ndlsearch.ndl.go.jp/books/primary');
});

test('multiple primary partitions keep deterministic primary precedence', () => {
  const automated = {
    records: [{
      work_id: 'wrk_partition', category: '数学', ndc_scheme: 'NDC9', ndc_code: '410',
      match_mode: 'title', source_url: 'https://ndlsearch.ndl.go.jp/books/automated',
    }],
  };
  const firstPrimary = {
    records: [{
      work_id: 'wrk_partition', category: '数学', ndc_scheme: 'NDC9', ndc_code: '410',
      match_mode: 'primary_bibliographic_record', source_url: 'https://ndlsearch.ndl.go.jp/books/primary-a',
    }],
  };
  const secondPrimary = {
    records: [{
      work_id: 'wrk_partition', category: '数学', ndc_scheme: 'NDC9', ndc_code: '410',
      match_mode: 'primary_bibliographic_record', source_url: 'https://ndlsearch.ndl.go.jp/books/primary-b',
    }],
  };
  const merged = mergeCategoryOverlays(automated, firstPrimary, secondPrimary);
  assert.equal(merged.records.length, 1);
  assert.equal(merged.records[0].source_url, 'https://ndlsearch.ndl.go.jp/books/primary-a');
});

test('conflicting primary and automated classifications are rejected', () => {
  const automated = {
    records: [{
      work_id: 'wrk_conflict', category: '数学', ndc_scheme: 'NDC9', ndc_code: '417',
    }],
  };
  const primary = {
    records: [{
      work_id: 'wrk_conflict', category: '経済', ndc_scheme: 'NDC9', ndc_code: '331',
    }],
  };
  assert.throws(
    () => mergeCategoryOverlays(automated, primary),
    /Conflicting category evidence for wrk_conflict/,
  );
});
