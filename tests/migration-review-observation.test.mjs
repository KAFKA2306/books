import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMigrationReviewObservations } from '../src/migration-review-observation.mjs';

const report = {
  summary: { handling_counts: { automatic: 1, input_correction: 0, bibliographic_review: 2 } },
  results: [
    { index: 0, handling: 'automatic', reason_codes: ['safe_new_work'] },
    { index: 1, handling: 'bibliographic_review', reason_codes: ['review_similar_title'] },
    { index: 2, handling: 'bibliographic_review', reason_codes: ['ambiguous_work_identity'] },
  ],
};

test('review observations preserve missing measurements and report coverage', () => {
  const measured = applyMigrationReviewObservations(report, [
    { index: 1, research_elapsed_seconds: 30, note: 'publisher page checked' },
  ]);

  assert.equal(measured.results[0].research_elapsed_seconds, null);
  assert.equal(measured.results[1].research_elapsed_seconds, 30);
  assert.equal(measured.results[2].research_elapsed_seconds, null);
  assert.deepEqual(measured.summary.review_measurement, {
    bibliographic_review_rows: 2,
    measured_rows: 1,
    measurement_coverage: 0.5,
    total_research_elapsed_seconds: 30,
    mean_research_elapsed_seconds_per_measured_review: 30,
    complete: false,
  });
});

test('complete review observations aggregate direct elapsed time only', () => {
  const measured = applyMigrationReviewObservations(report, [
    { index: 1, research_elapsed_seconds: 20 },
    { index: 2, research_elapsed_seconds: 40 },
  ]);
  assert.equal(measured.summary.review_measurement.measurement_coverage, 1);
  assert.equal(measured.summary.review_measurement.total_research_elapsed_seconds, 60);
  assert.equal(measured.summary.review_measurement.mean_research_elapsed_seconds_per_measured_review, 30);
  assert.equal(measured.summary.review_measurement.complete, true);
});

test('no review rows needs no inferred time and is complete', () => {
  const measured = applyMigrationReviewObservations({ summary: {}, results: [{ index: 0, handling: 'automatic' }] }, []);
  assert.deepEqual(measured.summary.review_measurement, {
    bibliographic_review_rows: 0,
    measured_rows: 0,
    measurement_coverage: 1,
    total_research_elapsed_seconds: null,
    mean_research_elapsed_seconds_per_measured_review: null,
    complete: true,
  });
});

test('invalid and duplicate observations fail closed', () => {
  assert.throws(() => applyMigrationReviewObservations(report, [{ index: 3, research_elapsed_seconds: 1 }]), /out of range/);
  assert.throws(() => applyMigrationReviewObservations(report, [{ index: 1, research_elapsed_seconds: -1 }]), /finite non-negative/);
  assert.throws(() => applyMigrationReviewObservations(report, [
    { index: 1, research_elapsed_seconds: 1 },
    { index: 1, research_elapsed_seconds: 2 },
  ]), /duplicate/);
});
