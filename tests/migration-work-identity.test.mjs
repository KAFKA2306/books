import test from 'node:test';
import assert from 'node:assert/strict';
import { precheckCandidates, titleKey } from '../src/catalog.mjs';
import { diagnoseMigration, normalizeMigrationRows } from '../src/migration-diagnosis.mjs';

const catalog = {
  works: [
    { work_id: 'novel', title: '十角館の殺人', title_key: titleKey('十角館の殺人'), work_type: 'text', author: '綾辻行人' },
    { work_id: 'comic', title: '十角館の殺人', title_key: titleKey('十角館の殺人'), work_type: 'comic', author: '清原紘' },
  ],
  editions: [],
};

test('author evidence uniquely resolves same-title works for a new edition', () => {
  const result = precheckCandidates([
    { title: '十角館の殺人', isbn13: '9780306406157', author: '清原 紘' },
  ], catalog);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].action, 'add_edition');
  assert.equal(result.results[0].matched_work_id, 'comic');
});

test('work_type evidence uniquely resolves same-title works for a new edition', () => {
  const result = precheckCandidates([
    { title: '十角館の殺人', isbn13: '9780306406157', work_type: 'text' },
  ], catalog);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].matched_work_id, 'novel');
});

test('same-title works remain fail-closed without unique identity evidence', () => {
  const result = precheckCandidates([
    { title: '十角館の殺人', isbn13: '9780306406157' },
  ], catalog);
  assert.equal(result.ok, false);
  assert.match(result.results[0].errors.join('\n'), /作品identityを一意に決定できません/);
});

test('conflicting explicit identity evidence is blocked instead of ignored', () => {
  const report = diagnoseMigration([
    { title: '十角館の殺人', isbn: '9780306406157', author: '存在しない著者' },
  ], catalog);
  assert.equal(report.results[0].action, 'blocked');
  assert.deepEqual(report.results[0].reason_codes, ['identity_evidence_mismatch']);
  assert.equal(report.results[0].matched_work_id, null);
});

test('migration normalization preserves optional identity evidence and null semantics', () => {
  assert.deepEqual(normalizeMigrationRows([
    { title: '十角館の殺人', isbn: '9780306406157', author: '清原紘', work_type: 'comic' },
    { title: '新しい本', isbn: '' },
  ]), [
    { title: '十角館の殺人', isbn: '9780306406157', author: '清原紘', work_type: 'comic', source: null, status: null, price: null, price_raw: null, purchase_date: null },
    { title: '新しい本', isbn: '', author: null, work_type: null, source: null, status: null, price: null, price_raw: null, purchase_date: null },
  ]);
});
