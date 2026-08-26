import test from 'node:test';
import assert from 'node:assert/strict';
import { annotateMigrationReviewCost, handlingForReasonCodes } from '../src/migration-review-cost.mjs';

test('handlingForReasonCodes separates automatic, input correction, and bibliographic review', () => {
  assert.equal(handlingForReasonCodes(['safe_new_work']), 'automatic');
  assert.equal(handlingForReasonCodes(['existing_holding']), 'automatic');
  assert.equal(handlingForReasonCodes(['duplicate_in_batch']), 'automatic');
  assert.equal(handlingForReasonCodes(['invalid_price']), 'input_correction');
  assert.equal(handlingForReasonCodes(['invalid_isbn', 'insufficient_metadata']), 'input_correction');
  assert.equal(handlingForReasonCodes(['review_similar_title']), 'bibliographic_review');
  assert.equal(handlingForReasonCodes(['ambiguous_work_identity']), 'bibliographic_review');
  assert.equal(handlingForReasonCodes(['existing_work_without_isbn']), 'bibliographic_review');
  assert.equal(handlingForReasonCodes(['invalid_isbn', 'ambiguous_work_identity']), 'bibliographic_review');
});

test('annotateMigrationReviewCost emits direct review-count and rate metrics', () => {
  const report = {
    schema_version: 1,
    summary: { total: 5, allowed: 2, blocked: 3 },
    results: [
      { reason_codes: ['safe_new_work'] },
      { reason_codes: ['existing_holding'] },
      { reason_codes: ['invalid_price'] },
      { reason_codes: ['ambiguous_work_identity'] },
      { reason_codes: ['review_similar_title'] },
    ],
  };
  const annotated = annotateMigrationReviewCost(report);
  assert.deepEqual(annotated.summary.handling_counts, {
    automatic: 2,
    input_correction: 1,
    bibliographic_review: 2,
  });
  assert.equal(annotated.summary.bibliographic_review_rate, 0.4);
  assert.equal(annotated.summary.input_correction_rate, 0.2);
  assert.deepEqual(annotated.results.map((result) => result.handling), [
    'automatic',
    'automatic',
    'input_correction',
    'bibliographic_review',
    'bibliographic_review',
  ]);
});

test('annotateMigrationReviewCost handles empty reports without inferred cost', () => {
  const annotated = annotateMigrationReviewCost({ summary: { total: 0 }, results: [] });
  assert.equal(annotated.summary.bibliographic_review_rate, 0);
  assert.equal(annotated.summary.input_correction_rate, 0);
});
