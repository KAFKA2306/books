const UNRESOLVED_OUTCOMES = new Set([
  'ambiguous',
  'no_candidate',
  'no_consensus',
  'provider_error',
]);

function validateSourceNeeds(sourceNeeds) {
  if (
    sourceNeeds?.schema !== 'kafka.books.isbn-exception-source-needs.v1'
    || !Array.isArray(sourceNeeds.records)
  ) {
    throw new Error('invalid ISBN exception source-needs data');
  }
}

export function auditIsbnExceptions(report, overlay, sourceNeeds = {
  schema: 'kafka.books.isbn-exception-source-needs.v1',
  records: [],
}) {
  if (report?.schema !== 'kafka.books.isbn-enrichment-report.v1' || !Array.isArray(report.results)) {
    throw new Error('invalid ISBN enrichment report');
  }
  if (overlay?.schema !== 'kafka.books.isbn-enrichments.v1' || !Array.isArray(overlay.records)) {
    throw new Error('invalid ISBN enrichment overlay');
  }
  validateSourceNeeds(sourceNeeds);

  const evidenceByWork = new Map(overlay.records.map((record) => [record.work_id, record]));
  const sourceNeedsByWork = new Map(sourceNeeds.records.map((record) => [record.work_id, record]));
  const historicalExceptions = report.results.filter((result) => UNRESOLVED_OUTCOMES.has(result.outcome));

  const records = historicalExceptions.map((result) => {
    const evidence = evidenceByWork.get(result.work_id) ?? null;
    const sourceNeed = evidence ? null : (sourceNeedsByWork.get(result.work_id) ?? null);
    return {
      work_id: result.work_id,
      title: result.title,
      historical_outcome: result.outcome,
      status: evidence ? 'resolved' : 'unresolved',
      isbn13: evidence?.isbn13 ?? null,
      verified_at: evidence?.verified_at ?? null,
      sources: evidence?.sources ?? [],
      current_metadata_sufficient_for_isbn_resolution:
        sourceNeed?.current_metadata_sufficient_for_isbn_resolution ?? null,
      required_metadata: sourceNeed?.required_metadata ?? [],
      source_need_reason: sourceNeed?.reason ?? null,
      source_need_sources: sourceNeed?.sources ?? [],
    };
  });

  const resolved = records.filter((record) => record.status === 'resolved');
  const unresolved = records.filter((record) => record.status === 'unresolved');
  const needsSourceDetail = unresolved.filter(
    (record) => record.current_metadata_sufficient_for_isbn_resolution === false,
  );
  const untriaged = unresolved.filter(
    (record) => record.current_metadata_sufficient_for_isbn_resolution === null,
  );

  return {
    schema: 'kafka.books.isbn-exception-audit.v1',
    source_report_generated_at: report.generated_at ?? null,
    summary: {
      historical_exception_count: records.length,
      resolved_count: resolved.length,
      unresolved_count: unresolved.length,
      needs_source_detail_count: needsSourceDetail.length,
      untriaged_count: untriaged.length,
      resolution_rate: records.length ? resolved.length / records.length : null,
    },
    records,
    unresolved,
    needs_source_detail: needsSourceDetail,
    untriaged,
  };
}
