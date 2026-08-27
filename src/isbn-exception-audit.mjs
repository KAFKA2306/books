const UNRESOLVED_OUTCOMES = new Set([
  'ambiguous',
  'no_candidate',
  'no_consensus',
  'provider_error',
]);

export function auditIsbnExceptions(report, overlay) {
  if (report?.schema !== 'kafka.books.isbn-enrichment-report.v1' || !Array.isArray(report.results)) {
    throw new Error('invalid ISBN enrichment report');
  }
  if (overlay?.schema !== 'kafka.books.isbn-enrichments.v1' || !Array.isArray(overlay.records)) {
    throw new Error('invalid ISBN enrichment overlay');
  }

  const evidenceByWork = new Map(overlay.records.map((record) => [record.work_id, record]));
  const historicalExceptions = report.results.filter((result) => UNRESOLVED_OUTCOMES.has(result.outcome));

  const records = historicalExceptions.map((result) => {
    const evidence = evidenceByWork.get(result.work_id) ?? null;
    return {
      work_id: result.work_id,
      title: result.title,
      historical_outcome: result.outcome,
      status: evidence ? 'resolved' : 'unresolved',
      isbn13: evidence?.isbn13 ?? null,
      verified_at: evidence?.verified_at ?? null,
      sources: evidence?.sources ?? [],
    };
  });

  const resolved = records.filter((record) => record.status === 'resolved');
  const unresolved = records.filter((record) => record.status === 'unresolved');

  return {
    schema: 'kafka.books.isbn-exception-audit.v1',
    source_report_generated_at: report.generated_at ?? null,
    summary: {
      historical_exception_count: records.length,
      resolved_count: resolved.length,
      unresolved_count: unresolved.length,
      resolution_rate: records.length ? resolved.length / records.length : null,
    },
    records,
    unresolved,
  };
}
