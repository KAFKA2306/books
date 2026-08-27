import assert from 'node:assert/strict';
import test from 'node:test';
import { auditHoldingDuplicates } from '../src/holding-duplicate-audit.mjs';

function holding(overrides = {}) {
  return {
    holding_id: 'h1',
    work_id: 'wrk_1',
    edition_id: 'pending:1',
    source: 'Kindle購入履歴',
    format: 'Kindle',
    quantity: 1,
    acquired_at: '2020-01-02',
    ...overrides,
  };
}

test('flags same-work same-day legacy and Amazon XML Kindle holdings when represented quantity matches', () => {
  const audit = auditHoldingDuplicates([
    holding(),
    holding({ holding_id: 'h2', edition_id: 'asin:B000TEST', source: 'Amazon Kindle XML' }),
  ]);
  assert.equal(audit.summary.candidate_group_count, 1);
  assert.equal(audit.summary.candidate_holding_count, 2);
  assert.equal(audit.summary.conflict_group_count, 0);
  assert.equal(audit.summary.quantity_reconciled_group_count, 1);
  assert.equal(audit.summary.quantity_mismatch_group_count, 0);
  assert.equal(audit.candidates[0].asin_backed_xml, true);
  assert.equal(audit.candidates[0].legacy_kindle_quantity, 1);
  assert.equal(audit.candidates[0].amazon_xml_quantity, 1);
  assert.equal(audit.candidates[0].quantity_reconciles, true);
  assert.equal(audit.candidates[0].evidence_status, 'quantity_reconciled');
  assert.deepEqual(audit.conflicts, []);
});

test('keeps represented quantity mismatch out of duplicate candidates', () => {
  const audit = auditHoldingDuplicates([
    holding({ quantity: 1 }),
    holding({ holding_id: 'h2', edition_id: 'asin:B000UPPER', source: 'Amazon Kindle XML', quantity: 1 }),
    holding({ holding_id: 'h3', edition_id: 'asin:B000LOWER', source: 'Amazon Kindle XML', quantity: 1 }),
  ]);
  assert.equal(audit.summary.candidate_group_count, 0);
  assert.equal(audit.summary.candidate_holding_count, 0);
  assert.equal(audit.summary.conflict_group_count, 1);
  assert.equal(audit.summary.conflict_holding_count, 3);
  assert.equal(audit.summary.quantity_reconciled_group_count, 0);
  assert.equal(audit.summary.quantity_mismatch_group_count, 1);
  assert.deepEqual(audit.candidates, []);
  assert.equal(audit.conflicts[0].legacy_kindle_quantity, 1);
  assert.equal(audit.conflicts[0].amazon_xml_quantity, 2);
  assert.equal(audit.conflicts[0].quantity_reconciles, false);
  assert.equal(audit.conflicts[0].evidence_status, 'quantity_mismatch');
  assert.ok(audit.conflicts[0].reasons.includes('represented_quantity_mismatch'));
});

test('does not flag different acquisition days', () => {
  const audit = auditHoldingDuplicates([
    holding(),
    holding({ holding_id: 'h2', edition_id: 'asin:B000TEST', source: 'Amazon Kindle XML', acquired_at: '2020-01-03' }),
  ]);
  assert.equal(audit.summary.candidate_group_count, 0);
  assert.equal(audit.summary.conflict_group_count, 0);
});

test('does not flag two holdings from the same provenance family', () => {
  const audit = auditHoldingDuplicates([
    holding(),
    holding({ holding_id: 'h2', edition_id: 'pending:2', source: 'Kindle購入履歴' }),
  ]);
  assert.equal(audit.summary.candidate_group_count, 0);
  assert.equal(audit.summary.conflict_group_count, 0);
});
