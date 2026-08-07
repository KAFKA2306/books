/**
 * Merge an audited issue import into the canonical catalog.
 * Existing works are treated as duplicate holdings and receive only new editions.
 * New works receive one source-scoped Kindle edition and one aggregated holding.
 */
export function mergeIssueCatalog(catalog, issueData) {
  const works = catalog.works.map((work) => ({ ...work, sources: [...work.sources], formats: [...work.formats] }));
  const editions = catalog.editions.map((edition) => ({ ...edition }));
  const holdings = catalog.holdings.map((holding) => ({ ...holding }));
  const workById = new Map(works.map((work) => [work.work_id, work]));
  const existingWorkIds = new Set(workById.keys());
  const editionIds = new Set(editions.map((edition) => edition.edition_id));
  const isbnValues = new Set(editions.map((edition) => edition.isbn13).filter(Boolean));
  const newRecordCounts = new Map();
  const resolutions = [];

  for (const record of issueData.records) {
    const existed = existingWorkIds.has(record.work_id);
    let work = workById.get(record.work_id);
    if (!work) {
      work = {
        work_id: record.work_id,
        title: record.work_title,
        title_key: record.title_key,
        author: null,
        category: record.category,
        status: 'untracked',
        progress: null,
        rating: null,
        price_yen: null,
        acquired_at: null,
        item_count: 0,
        isbn_count: 0,
        isbn_status: 'missing',
        sources: [],
        formats: [],
      };
      works.push(work);
      workById.set(work.work_id, work);
    }

    for (const edition of record.editions) {
      if (edition.isbn13 && isbnValues.has(edition.isbn13)) continue;
      if (editionIds.has(edition.edition_id)) continue;
      editions.push({
        ...edition,
        id_kind: edition.isbn13 ? 'isbn13' : edition.jan ? 'jan' : 'source_scoped',
        work_id: record.work_id,
        isbn10: null,
        language: edition.language ?? 'ja',
        published_year: edition.published_at ? Number(edition.published_at.slice(0, 4)) : null,
      });
      editionIds.add(edition.edition_id);
      if (edition.isbn13) isbnValues.add(edition.isbn13);
    }

    if (existed) {
      resolutions.push({ ordinal: record.ordinal, work_id: record.work_id, action: 'skipped_duplicate_holding' });
      continue;
    }
    newRecordCounts.set(record.work_id, (newRecordCounts.get(record.work_id) ?? 0) + 1);
    resolutions.push({ ordinal: record.ordinal, work_id: record.work_id, action: 'added_new_holding' });
  }

  for (const [workId, quantity] of newRecordCounts) {
    const work = workById.get(workId);
    const kindleEditionId = `kindle:${workId}`;
    if (!editionIds.has(kindleEditionId)) {
      editions.push({
        edition_id: kindleEditionId,
        id_kind: 'source_scoped',
        work_id: workId,
        isbn13: null,
        isbn10: null,
        title: work.title,
        authors: null,
        publisher: null,
        published_at: null,
        published_year: null,
        format: 'Kindle',
        language: 'ja',
        verification: 'unverified',
        source_url: null,
      });
      editionIds.add(kindleEditionId);
    }
    holdings.push({
      holding_id: `hld_issue1_${workId.slice(4)}`,
      work_id: workId,
      edition_id: kindleEditionId,
      source: 'Kindleスクリーンショット',
      format: 'Kindle',
      quantity,
      acquired_at: null,
      price_yen: null,
      progress: null,
      rating: null,
    });
    work.item_count += quantity;
    if (!work.sources.includes('Kindleスクリーンショット')) work.sources.push('Kindleスクリーンショット');
    if (!work.formats.includes('Kindle')) work.formats.push('Kindle');
  }

  const editionsByWork = new Map();
  for (const edition of editions) {
    const list = editionsByWork.get(edition.work_id) ?? [];
    list.push(edition);
    editionsByWork.set(edition.work_id, list);
  }
  for (const work of works) {
    const list = editionsByWork.get(work.work_id) ?? [];
    const verified = list.filter((edition) => edition.verification === 'verified' && edition.isbn13);
    work.isbn_count = new Set(verified.map((edition) => edition.isbn13)).size;
    work.isbn_status = work.isbn_count ? 'verified' : 'missing';
    const authored = list.find((edition) => edition.authors);
    if (authored) work.author = authored.authors;
  }

  works.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  const addedRecords = [...newRecordCounts.values()].reduce((sum, value) => sum + value, 0);
  const stats = {
    ...catalog.stats,
    input_count: catalog.stats.input_count + addedRecords,
    work_count: works.length,
    edition_count: editions.length,
    holding_count: holdings.length,
    merged_input_count: catalog.stats.input_count + addedRecords - works.length,
    isbn_verified_count: new Set(editions.filter((edition) => edition.verification === 'verified').map((edition) => edition.isbn13).filter(Boolean)).size,
    untracked_count: works.filter((work) => work.status === 'untracked').length,
    issue_1_record_count: issueData.records.length,
    issue_1_duplicate_skipped_count: resolutions.filter((item) => item.action === 'skipped_duplicate_holding').length,
    issue_1_added_record_count: addedRecords,
    issue_1_new_work_count: newRecordCounts.size,
  };

  return { ...catalog, stats, works, editions, holdings, issue_records: issueData.records, issue_resolutions: resolutions };
}
