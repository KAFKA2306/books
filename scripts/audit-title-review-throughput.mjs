import fs from 'node:fs/promises';
import path from 'node:path';

export function summarizeTitleReviewThroughput(data, { excludeConfounded = true } = {}) {
  if (data?.schema !== 'kafka.books.title-review-throughput-benchmark.v1' || !Array.isArray(data.observations)) {
    throw new Error('invalid title review throughput benchmark schema');
  }

  const observations = data.observations.filter((row) => !excludeConfounded || !row.confounded);
  const byWorkflow = new Map();
  for (const row of observations) {
    if (!Number.isFinite(row.elapsed_seconds) || !Number.isInteger(row.records_accepted) || row.records_accepted <= 0) {
      throw new Error(`invalid throughput observation for PR #${row.pr ?? 'unknown'}`);
    }
    const aggregate = byWorkflow.get(row.workflow) ?? { prs: 0, records: 0, elapsed_seconds: 0 };
    aggregate.prs += 1;
    aggregate.records += row.records_accepted;
    aggregate.elapsed_seconds += row.elapsed_seconds;
    byWorkflow.set(row.workflow, aggregate);
  }

  const workflows = Object.fromEntries([...byWorkflow.entries()].map(([name, aggregate]) => [name, {
    ...aggregate,
    seconds_per_accepted_record: aggregate.elapsed_seconds / aggregate.records,
    records_per_hour_of_pr_lifecycle: aggregate.records * 3600 / aggregate.elapsed_seconds,
    prs_per_10_records: aggregate.prs * 10 / aggregate.records,
  }]));

  const single = workflows.single_record;
  const batch = workflows.batch;
  return {
    metric_scope: data.metric_scope,
    exclude_confounded: excludeConfounded,
    workflows,
    batch_speedup_pr_lifecycle_per_record: single && batch
      ? single.seconds_per_accepted_record / batch.seconds_per_accepted_record
      : null,
  };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (isMain) {
  const benchmarkPath = path.join(process.cwd(), 'data/benchmarks/title-review-throughput.json');
  const data = JSON.parse(await fs.readFile(benchmarkPath, 'utf8'));
  const strict = summarizeTitleReviewThroughput(data, { excludeConfounded: true });
  const all = summarizeTitleReviewThroughput(data, { excludeConfounded: false });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ strict, all }, null, 2));
  } else {
    const single = strict.workflows.single_record;
    const batch = strict.workflows.batch;
    console.log(`title review throughput (${strict.metric_scope}; confounded excluded)`);
    console.log(`single: ${single.records} records / ${single.prs} PRs / ${single.elapsed_seconds}s = ${single.seconds_per_accepted_record.toFixed(2)}s per accepted record`);
    console.log(`batch: ${batch.records} records / ${batch.prs} PR / ${batch.elapsed_seconds}s = ${batch.seconds_per_accepted_record.toFixed(2)}s per accepted record`);
    console.log(`batch speedup for PR-open-to-merge latency per accepted record: ${strict.batch_speedup_pr_lifecycle_per_record.toFixed(2)}x`);
    console.log('boundary: pre-PR research time is not measured by this benchmark');
  }
}
