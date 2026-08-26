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

test('flags same-work same-day legacy and Amazon XML Kindle holdings', () => {
  const audit = auditHoldingDuplicates([
    holding(),
    holding({ holding_id: 'h2', edition_id: 'asin:B000TEST', source: 'Amazon Kindle XML' }),
  ]);
  assert.equal(audit.summary.candidate_group_count, 1);
  assert.equal(audit.summary.candidate_holding_count, 2);
  assert.equal(audit.candidates[0].asin_backed_xml, true);
});

test('does not flag different acquisition days', () => {
  const audit = auditHoldingDuplicates([
    holding(),
    holding({ holding_id: 'h2', edition_id: 'asin:B000TEST', source: 'Amazon Kindle XML', acquired_at: '2020-01-03' }),
  ]);
  assert.equal(audit.summary.candidate_group_count, 0);
});

test('does not flag two holdings from the same provenance family', () => {
  const audit = auditHoldingDuplicates([
    holding(),
    holding({ holding_id: 'h2', edition_id: 'pending:2', source: 'Kindle購入履歴' }),
  ]);
  assert.equal(audit.summary.candidate_group_count, 0);
});
