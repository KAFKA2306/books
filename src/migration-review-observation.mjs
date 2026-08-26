function normalizeObservedSeconds(value, label) {
  if (value == null) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${label} must be a finite non-negative number or null.`);
  }
  return numeric;
}

export function applyMigrationReviewObservations(report, observations = []) {
  if (!Array.isArray(observations)) throw new Error('review observations must be an array.');

  const byIndex = new Map();
  for (const observation of observations) {
    if (!Number.isInteger(observation?.index) || observation.index < 0 || observation.index >= report.results.length) {
      throw new Error(`review observation index out of range: ${observation?.index}`);
    }
    if (byIndex.has(observation.index)) throw new Error(`duplicate review observation index: ${observation.index}`);
    byIndex.set(observation.index, {
      research_elapsed_seconds: normalizeObservedSeconds(observation.research_elapsed_seconds, 'research_elapsed_seconds'),
      note: observation.note == null ? null : String(observation.note),
    });
  }

  const results = report.results.map((result) => {
    const observation = byIndex.get(result.index);
    return {
      ...result,
      research_elapsed_seconds: observation?.research_elapsed_seconds ?? null,
      review_note: observation?.note ?? null,
    };
  });

  const reviewRows = results.filter((result) => result.handling === 'bibliographic_review');
  const measuredReviewRows = reviewRows.filter((result) => result.research_elapsed_seconds != null);
  const totalResearchElapsedSeconds = measuredReviewRows.reduce((sum, result) => sum + result.research_elapsed_seconds, 0);
  const measuredCount = measuredReviewRows.length;
  const reviewCount = reviewRows.length;

  return {
    ...report,
    summary: {
      ...report.summary,
      review_measurement: {
        bibliographic_review_rows: reviewCount,
        measured_rows: measuredCount,
        measurement_coverage: reviewCount ? measuredCount / reviewCount : 1,
        total_research_elapsed_seconds: measuredCount ? totalResearchElapsedSeconds : null,
        mean_research_elapsed_seconds_per_measured_review: measuredCount ? totalResearchElapsedSeconds / measuredCount : null,
        complete: measuredCount === reviewCount,
      },
    },
    results,
  };
}
