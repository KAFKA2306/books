export const CLASSIFICATION_SCHEMES = [
  {
    scheme_id: 'ndc10',
    name: '日本十進分類法 新訂10版',
    authority: '日本図書館協会',
    role: 'primary',
    uri_prefix: 'http://id.ndl.go.jp/class/ndc10/',
  },
  {
    scheme_id: 'ndc9',
    name: '日本十進分類法 新訂9版',
    authority: '日本図書館協会',
    role: 'legacy_source_reported',
    uri_prefix: 'http://id.ndl.go.jp/class/ndc9/',
  },
  {
    scheme_id: 'ndc',
    name: '日本十進分類法（版不明）',
    authority: '日本図書館協会',
    role: 'source_reported_unversioned',
    uri_prefix: null,
  },
];

export const NDC10_MAIN_CLASSES = [
  { code: '0', label: '総記' },
  { code: '1', label: '哲学' },
  { code: '2', label: '歴史' },
  { code: '3', label: '社会科学' },
  { code: '4', label: '自然科学' },
  { code: '5', label: '技術' },
  { code: '6', label: '産業' },
  { code: '7', label: '芸術' },
  { code: '8', label: '言語' },
  { code: '9', label: '文学' },
];

export function normalizeScheme(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'ndc10') return 'ndc10';
  if (normalized === 'ndc9') return 'ndc9';
  if (normalized === 'ndc') return 'ndc';
  return null;
}

export function mainClassFor(code) {
  const first = String(code ?? '').trim()[0];
  return NDC10_MAIN_CLASSES.find((row) => row.code === first) ?? null;
}

export function deriveLibraryClassifications(catalog, categoryOverlay) {
  const records = Array.isArray(categoryOverlay?.records) ? categoryOverlay.records : [];
  const editions = catalog.editions ?? [];
  const editionByWorkAndIsbn = new Map(
    editions
      .filter((edition) => edition.isbn13)
      .map((edition) => [`${edition.work_id}\t${edition.isbn13}`, edition]),
  );

  const classifications = records.flatMap((record) => {
    const scheme_id = normalizeScheme(record.ndc_scheme);
    const code = String(record.ndc_code ?? '').trim();
    if (!scheme_id || !code) return [];
    const main = scheme_id === 'ndc10' ? mainClassFor(code) : null;
    const edition = record.source_isbn13
      ? editionByWorkAndIsbn.get(`${record.work_id}\t${record.source_isbn13}`)
      : null;
    return [{
      classification_id: `cls:${record.work_id}:${scheme_id}:${code}`,
      work_id: record.work_id,
      edition_id: edition?.edition_id ?? null,
      scheme_id,
      code,
      main_class_code: main?.code ?? null,
      main_class_label: main?.label ?? null,
      source_provider: 'ndl_search',
      source_url: record.source_url ?? null,
      source_isbn13: record.source_isbn13 ?? null,
      match_mode: record.match_mode ?? null,
      title_similarity: record.title_similarity ?? null,
      verification: 'source_reported',
      verified_at: record.verified_at ?? null,
    }];
  });

  classifications.sort((a, b) => a.classification_id.localeCompare(b.classification_id));
  const classifiedWorks = new Set(classifications.map((row) => row.work_id));
  const ndc10Works = new Set(classifications.filter((row) => row.scheme_id === 'ndc10').map((row) => row.work_id));

  return {
    ...catalog,
    classifications,
    classification_schemes: CLASSIFICATION_SCHEMES,
    ndc10_main_classes: NDC10_MAIN_CLASSES,
    stats: {
      ...catalog.stats,
      classification_record_count: classifications.length,
      classified_work_count: classifiedWorks.size,
      ndc10_classified_work_count: ndc10Works.size,
    },
  };
}
