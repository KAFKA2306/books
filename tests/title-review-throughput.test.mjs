import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTitleReviewThroughput } from '../scripts/audit-title-review-throughput.mjs';

const benchmark = {
  schema: 'kafka.books.title-review-throughput-benchmark.v1',
  metric_scope: 'github_pr_open_to_merge',
  observations: [
    { workflow: 'single_record', pr: 1, records_accepted: 1, elapsed_seconds: 60, confounded: false },
    { workflow: 'single_record', pr: 2, records_accepted: 1, elapsed_seconds: 300, confounded: true },
    { workflow: 'batch', pr: 3, records_accepted: 6, elapsed_seconds: 60, confounded: false }
  ]
};

test('throughput summary compares per-record PR lifecycle latency', () => {
  const result = summarizeTitleReviewThroughput(benchmark);
  assert.equal(result.workflows.single_record.seconds_per_accepted_record, 60);
  assert.equal(result.workflows.batch.seconds_per_accepted_record, 10);
  assert.equal(result.workflows.single_record.prs_per_10_records, 10);
  assert.equal(result.workflows.batch.prs_per_10_records, 10 / 6);
  assert.equal(result.batch_speedup_pr_lifecycle_per_record, 6);
});

test('confounded observations are excluded by default but can be included', () => {
  const strict = summarizeTitleReviewThroughput(benchmark);
  const all = summarizeTitleReviewThroughput(benchmark, { excludeConfounded: false });
  assert.equal(strict.workflows.single_record.elapsed_seconds, 60);
  assert.equal(all.workflows.single_record.elapsed_seconds, 360);
});

test('invalid observations fail closed', () => {
  assert.throws(
    () => summarizeTitleReviewThroughput({
      ...benchmark,
      observations: [{ workflow: 'batch', pr: 4, records_accepted: 0, elapsed_seconds: 10 }]
    }),
    /invalid throughput observation/,
  );
});
