export const WORK_MERGE_SCHEMA = 'kafka.books.work-merges.v1';

function remapWorkId(value, redirects) {
  return value && redirects.has(value) ? redirects.get(value) : value;
}

function recomputeWorkAggregates(works, editions, holdings) {
  const holdingsByWork = new Map();
  for (const holding of holdings) {
    const list = holdingsByWork.get(holding.work_id) ?? [];
    list.push(holding);
    holdingsByWork.set(holding.work_id, list);
  }
  const editionsByWork = new Map();
  for (const edition of editions) {
    const list = editionsByWork.get(edition.work_id) ?? [];
    list.push(edition);
    editionsByWork.set(edition.work_id, list);
  }

  for (const work of works) {
    const workHoldings = holdingsByWork.get(work.work_id) ?? [];
    work.item_count = workHoldings.reduce((sum, holding) => sum + (holding.quantity ?? 0), 0);
    work.sources = [...new Set(workHoldings.map((holding) => holding.source).filter(Boolean))];
    work.formats = [...new Set(workHoldings.map((holding) => holding.format).filter(Boolean))];
    const verified = (editionsByWork.get(work.work_id) ?? [])
      .filter((edition) => edition.verification === 'verified' && edition.isbn13);
    work.isbn_count = new Set(verified.map((edition) => edition.isbn13)).size;
    work.isbn_status = work.isbn_count ? 'verified' : 'missing';
  }
}

function remapClassifications(rows, redirects) {
  const byId = new Map();
  for (const row of rows ?? []) {
    const workId = remapWorkId(row.work_id, redirects);
    const classificationId = row.classification_id?.startsWith('cls:')
      ? `cls:${workId}:${row.scheme_id}:${row.code}`
      : row.classification_id;
    const remapped = { ...row, work_id: workId, classification_id: classificationId };
    if (!byId.has(classificationId)) byId.set(classificationId, remapped);
  }
  return [...byId.values()];
}

export function applyWorkMerges(catalog, overlay) {
  if (!overlay || overlay.schema !== WORK_MERGE_SCHEMA) {
    throw new Error(`invalid work merge schema: ${overlay?.schema ?? 'missing'}`);
  }

  const records = overlay.records ?? [];
  const redirects = new Map();
  for (const record of records) {
    if (!record?.from_work_id || !record?.into_work_id) throw new Error('work merge requires from_work_id and into_work_id');
    if (record.from_work_id === record.into_work_id) throw new Error(`work merge cannot target itself: ${record.from_work_id}`);
    if (!record.source_url?.startsWith('https://')) throw new Error(`work merge requires HTTPS source_url: ${record.from_work_id}`);
    if (redirects.has(record.from_work_id)) throw new Error(`duplicate work merge source: ${record.from_work_id}`);
    redirects.set(record.from_work_id, record.into_work_id);
  }
  for (const target of redirects.values()) {
    if (redirects.has(target)) throw new Error(`chained work merges are not allowed: ${target}`);
  }

  const works = catalog.works.map((work) => ({ ...work, sources: [...(work.sources ?? [])], formats: [...(work.formats ?? [])] }));
  const workById = new Map(works.map((work) => [work.work_id, work]));
  for (const record of records) {
    const source = workById.get(record.from_work_id);
    const target = workById.get(record.into_work_id);
    if (!source) throw new Error(`work merge source not found: ${record.from_work_id}`);
    if (!target) throw new Error(`work merge target not found: ${record.into_work_id}`);
    if (record.from_title && source.title !== record.from_title) {
      throw new Error(`work merge source title drift for ${record.from_work_id}: expected ${record.from_title}, got ${source.title}`);
    }
    if (record.into_title && target.title !== record.into_title) {
      throw new Error(`work merge target title drift for ${record.into_work_id}: expected ${record.into_title}, got ${target.title}`);
    }

    if (record.author) target.author = record.author;
    else if (!target.author && source.author) target.author = source.author;
    if ((target.category === '未分類' || !target.category) && source.category && source.category !== '未分類') target.category = source.category;
    if (target.status === 'untracked' && source.status && source.status !== 'untracked') target.status = source.status;
    if (target.progress == null && source.progress != null) target.progress = source.progress;
    if (target.rating == null && source.rating != null) target.rating = source.rating;
    if (target.price_yen == null && source.price_yen != null) target.price_yen = source.price_yen;
    if (!target.acquired_at && source.acquired_at) target.acquired_at = source.acquired_at;
  }

  const mergedWorks = works.filter((work) => !redirects.has(work.work_id));
  const editions = catalog.editions.map((edition) => ({ ...edition, work_id: remapWorkId(edition.work_id, redirects) }));
  const holdings = catalog.holdings.map((holding) => ({ ...holding, work_id: remapWorkId(holding.work_id, redirects) }));
  const acquisitions = (catalog.acquisitions ?? []).map((item) => ({ ...item, work_id: remapWorkId(item.work_id, redirects) }));
  const kindleItems = (catalog.kindle_items ?? []).map((item) => ({ ...item, work_id: remapWorkId(item.work_id, redirects) }));
  const kindleMatchAudit = (catalog.kindle_match_audit ?? []).map((item) => ({ ...item, work_id: remapWorkId(item.work_id, redirects) }));
  const issueRecords = (catalog.issue_records ?? []).map((item) => ({ ...item, work_id: remapWorkId(item.work_id, redirects) }));
  const issueResolutions = (catalog.issue_resolutions ?? []).map((item) => ({ ...item, work_id: remapWorkId(item.work_id, redirects) }));
  const classifications = remapClassifications(catalog.classifications ?? [], redirects);

  recomputeWorkAggregates(mergedWorks, editions, holdings);
  mergedWorks.sort((a, b) => a.title.localeCompare(b.title, 'ja'));

  const inputCount = holdings.reduce((sum, holding) => sum + (holding.quantity ?? 0), 0);
  const stats = {
    ...catalog.stats,
    input_count: inputCount,
    work_count: mergedWorks.length,
    edition_count: editions.length,
    holding_count: holdings.length,
    merged_input_count: inputCount - mergedWorks.length,
    isbn_verified_count: new Set(editions.filter((edition) => edition.verification === 'verified').map((edition) => edition.isbn13).filter(Boolean)).size,
    untracked_count: mergedWorks.filter((work) => work.status === 'untracked').length,
    classification_record_count: classifications.length,
    classified_work_count: new Set(classifications.map((row) => row.work_id)).size,
    ndc10_classified_work_count: new Set(classifications.filter((row) => row.scheme_id === 'ndc10').map((row) => row.work_id)).size,
    work_merge_count: records.length,
  };

  return {
    ...catalog,
    stats,
    works: mergedWorks,
    editions,
    holdings,
    acquisitions,
    kindle_items: kindleItems,
    kindle_match_audit: kindleMatchAudit,
    issue_records: issueRecords,
    issue_resolutions: issueResolutions,
    classifications,
    work_merge_audit: records.map((record) => ({ ...record })),
  };
}
