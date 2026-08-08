import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLASSIFICATION_SCHEMES,
  NDC10_MAIN_CLASSES,
  deriveLibraryClassifications,
  mainClassFor,
  normalizeScheme,
} from '../src/library-classification.mjs';

test('NDC10 registry contains the official ten first-level classes', () => {
  assert.deepEqual(NDC10_MAIN_CLASSES.map(({ code, label }) => [code, label]), [
    ['0', '総記'], ['1', '哲学'], ['2', '歴史'], ['3', '社会科学'], ['4', '自然科学'],
    ['5', '技術'], ['6', '産業'], ['7', '芸術'], ['8', '言語'], ['9', '文学'],
  ]);
  assert.equal(CLASSIFICATION_SCHEMES.find((row) => row.scheme_id === 'ndc10')?.role, 'primary');
  assert.equal(CLASSIFICATION_SCHEMES.find((row) => row.scheme_id === 'ndc8')?.role, 'legacy_source_reported');
});

test('scheme versions are preserved without cross-version conversion', () => {
  assert.equal(normalizeScheme('NDC10'), 'ndc10');
  assert.equal(normalizeScheme('NDC9'), 'ndc9');
  assert.equal(normalizeScheme('NDC8'), 'ndc8');
  assert.equal(normalizeScheme('NDC'), 'ndc');
  assert.equal(mainClassFor('338.18')?.label, '社会科学');
});

test('classification records are derived from the same category enrichment evidence', () => {
  const catalog = {
    stats: {},
    works: [{ work_id: 'wrk_1' }, { work_id: 'wrk_2' }],
    editions: [{ edition_id: '9780000000002', work_id: 'wrk_1', isbn13: '9780000000002' }],
    holdings: [],
  };
  const overlay = {
    records: [
      {
        work_id: 'wrk_1',
        ndc_scheme: 'NDC10',
        ndc_code: '338.18',
        source_isbn13: '9780000000002',
        source_url: 'https://ndlsearch.ndl.go.jp/books/example',
        match_mode: 'isbn',
        title_similarity: 1,
        verified_at: '2026-08-08T00:00:00Z',
      },
      {
        work_id: 'wrk_2',
        ndc_scheme: 'NDC8',
        ndc_code: '470',
        source_isbn13: null,
        source_url: 'https://ndlsearch.ndl.go.jp/books/legacy',
        match_mode: 'title',
        title_similarity: 1,
        verified_at: '2026-08-08T00:00:00Z',
      },
    ],
  };
  const result = deriveLibraryClassifications(catalog, overlay);
  assert.equal(result.classifications.length, 2);
  assert.equal(result.classifications[0].scheme_id, 'ndc10');
  assert.equal(result.classifications[0].code, '338.18');
  assert.equal(result.classifications[0].main_class_code, '3');
  assert.equal(result.classifications[0].main_class_label, '社会科学');
  assert.equal(result.classifications[0].edition_id, '9780000000002');
  assert.equal(result.classifications[1].scheme_id, 'ndc8');
  assert.equal(result.classifications[1].code, '470');
  assert.equal(result.classifications[1].main_class_code, null);
  assert.equal(result.classifications[1].main_class_label, null);
});
