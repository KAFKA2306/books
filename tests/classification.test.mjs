import assert from 'node:assert/strict';
import test from 'node:test';
import { applyClassificationOverlay, ndc10MainClass, parseNdlClassifications } from '../src/classification.mjs';

const xml = `
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dcterms="http://purl.org/dc/terms/">
  <dcterms:subject rdf:resource="http://id.ndl.go.jp/class/ndc10/007.35"/>
  <dcterms:subject rdf:resource="http://id.ndl.go.jp/class/ndlc/UL31"/>
  <dcterms:subject rdf:resource="http://id.ndl.go.jp/class/ndc9/007.35"/>
  <dcterms:subject rdf:resource="http://id.ndl.go.jp/class/ndc10/007.35"/>
</rdf:RDF>`;

test('NDL classifications are parsed without duplicate codes or cross-version conversion', () => {
  assert.deepEqual(parseNdlClassifications(xml), [
    { scheme_id: 'ndc10', code: '007.35', uri: 'http://id.ndl.go.jp/class/ndc10/007.35' },
    { scheme_id: 'ndlc', code: 'UL31', uri: 'http://id.ndl.go.jp/class/ndlc/UL31' },
    { scheme_id: 'ndc9', code: '007.35', uri: 'http://id.ndl.go.jp/class/ndc9/007.35' },
  ]);
});

test('NDC10 main class is derived only from the reported code', () => {
  const main = ndc10MainClass('489.56', [{ code: '4', label: '自然科学' }]);
  assert.deepEqual(main, { code: '4', label: '自然科学' });
});

test('classification overlay becomes canonical catalog arrays and stats', () => {
  const catalog = { stats: {}, works: [{ work_id: 'wrk_1' }], editions: [{ edition_id: 'isbn:1', work_id: 'wrk_1' }], holdings: [] };
  const overlay = {
    classification_schemes: [{ scheme_id: 'ndc10', role: 'primary' }],
    ndc10_main_classes: [{ code: '0', label: '総記' }],
    records: [{ classification_id: 'cls:1', work_id: 'wrk_1', edition_id: 'isbn:1', scheme_id: 'ndc10', code: '007.35' }],
  };
  const merged = applyClassificationOverlay(catalog, overlay);
  assert.equal(merged.classifications.length, 1);
  assert.equal(merged.stats.classification_record_count, 1);
  assert.equal(merged.stats.classified_work_count, 1);
  assert.equal(merged.stats.ndc10_classified_work_count, 1);
});
