const BIBLIOGRAPHIC_REVIEW_CODES = new Set([
  'review_similar_title',
  'ambiguous_work_identity',
  'identity_evidence_mismatch',
  'existing_work_without_isbn',
]);

const INPUT_CORRECTION_CODES = new Set([
  'invalid_isbn',
  'invalid_price',
  'insufficient_metadata',
]);

export function handlingForReasonCodes(reasonCodes = []) {
  if (reasonCodes.some((code) => BIBLIOGRAPHIC_REVIEW_CODES.has(code))) return 'bibliographic_review';
  if (reasonCodes.some((code) => INPUT_CORRECTION_CODES.has(code))) return 'input_correction';
  return 'automatic';
}

export function annotateMigrationReviewCost(report) {
  const results = report.results.map((result) => ({
    ...result,
    handling: handlingForReasonCodes(result.reason_codes),
  }));
  const handlingCounts = {
    automatic: results.filter((result) => result.handling === 'automatic').length,
    input_correction: results.filter((result) => result.handling === 'input_correction').length,
    bibliographic_review: results.filter((result) => result.handling === 'bibliographic_review').length,
  };
  const total = results.length;
  return {
    ...report,
    summary: {
      ...report.summary,
      handling_counts: handlingCounts,
      bibliographic_review_rate: total ? handlingCounts.bibliographic_review / total : 0,
      input_correction_rate: total ? handlingCounts.input_correction / total : 0,
    },
    results,
  };
}
