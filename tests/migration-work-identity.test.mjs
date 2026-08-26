import assert from 'node:assert/strict';
import test from 'node:test';

import { diagnoseMigration, normalizeMigrationRows } from '../src/migration-diagnosis.mjs';

const catalog = {
  works: [
    { id: 'wrk_text', title: '十角館の殺人', author: '綾辻行人', work_type: 'text' },
    { id: 'wrk_comic', title: '十角館の殺人', author: '清原紘', work_type: 'comic' },
  ],
  editions: [],
  holdings: [],
};

test('author evidence uniquely resolves same-title works for a new edition', () => {
  const report = diagnoseMigration([
    { title: '十角館の殺人', isbn: '9780306406157', author: '清原紘' },
  ], catalog);
  assert.equal(report.results[0].action, 'add_edition');
  assert.equal(report.results[0].matched_work_id, 'wrk_comic');
});

test('work_type evidence uniquely resolves same-title works for a new edition', () => {
  const report = diagnoseMigration([
    { title: '十角館の殺人', isbn: '9780306406157', work_type: 'text' },
  ], catalog);
  assert.equal(report.results[0].action, 'add_edition');
  assert.equal(report.results[0].matched_work_id, 'wrk_text');
});

test('same-title works remain fail-closed without unique identity evidence', () => {
  const report = diagnoseMigration([
    { title: '十角館の殺人', isbn: '9780306406157' },
  ], catalog);
  assert.equal(report.results[0].action, 'blocked');
  assert.deepEqual(report.results[0].reason_codes, ['ambiguous_work_identity']);
  assert.equal(report.results[0].matched_work_id, null);
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
