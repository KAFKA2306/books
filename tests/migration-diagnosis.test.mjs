import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseMigration, parseCsv, parseIsbnList, parseJson, parseMigrationInput, renderDiagnosisHtml } from '../src/migration-diagnosis.mjs';

const catalog = {
  works: [
    { work_id: 'work-1', title: '赤毛のアン', title_key: '赤毛のアン' },
    { work_id: 'work-2', title: 'データサイエンス入門', title_key: 'データサイエンス入門' },
  ],
  editions: [
    { edition_id: 'edition-1', work_id: 'work-1', isbn13: '9784102113417' },
  ],
};

test('parseCsv handles quoted commas and optional fields', () => {
  const rows = parseCsv('title,isbn,source,price\n"Test, Book",9784102113417,Kindle,1200\n');
  assert.deepEqual(rows, [{ title: 'Test, Book', isbn: '9784102113417', source: 'Kindle', price: '1200' }]);
});

test('parseJson accepts arrays and an items envelope without inventing fields', () => {
  assert.deepEqual(parseJson('[{"title":"新しい本","isbn":"9784102113417"}]'), [{ title: '新しい本', isbn: '9784102113417' }]);
  assert.deepEqual(parseJson('{"items":[{"title":"別の本"}]}'), [{ title: '別の本' }]);
  assert.throws(() => parseJson('{"title":"not-an-array"}'), /items array/);
});

test('parseIsbnList ignores blank/comment lines and preserves each ISBN for validation', () => {
  assert.deepEqual(parseIsbnList('# export\n9784102113417\n\ninvalid-isbn\n'), [
    { title: '', isbn: '9784102113417' },
    { title: '', isbn: 'invalid-isbn' },
  ]);
});

test('parseMigrationInput rejects unknown formats', () => {
  assert.deepEqual(parseMigrationInput('title,isbn\nA,9784102113417\n', 'csv'), [{ title: 'A', isbn: '9784102113417' }]);
  assert.throws(() => parseMigrationInput('x', 'xml'), /Unsupported migration input format/);
});

test('diagnoseMigration keeps catalog read-only and emits machine-readable reason codes', () => {
  const before = JSON.stringify(catalog);
  const rows = [
    { title: '赤毛のアン', isbn: '9784102113417' },
    { title: '新しい本', isbn: '' },
    { title: '', isbn: '1234' },
    { title: '新しい本', isbn: '' },
  ];
  const report = diagnoseMigration(rows, catalog);

  assert.equal(report.mode, 'dry-run');
  assert.equal(report.catalog_mutated, false);
  assert.equal(JSON.stringify(catalog), before);
  assert.ok(report.results[0].reason_codes.includes('existing_holding'));
  assert.ok(report.results[1].reason_codes.includes('safe_new_work'));
  assert.ok(report.results[2].reason_codes.includes('invalid_isbn'));
  assert.ok(report.results[2].reason_codes.includes('insufficient_metadata'));
  assert.ok(report.results[3].reason_codes.includes('duplicate_in_batch'));
});

test('renderDiagnosisHtml states the non-mutating boundary', () => {
  const report = diagnoseMigration([{ title: '新しい本', isbn: '' }], catalog);
  const html = renderDiagnosisHtml(report);
  assert.match(html, /dry-run/);
  assert.match(html, /正準catalogを書き換えません/);
  assert.match(html, /safe_new_work/);
});
