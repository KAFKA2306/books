export const SOURCE_GROUPS = Object.freeze(['Kindle', '紙の本', '図書館']);

export function normalizeSourceGroup(source = '', format = '') {
  const sourceText = `${source ?? ''}`.normalize('NFKC').toLocaleLowerCase('ja');
  const formatText = `${format ?? ''}`.normalize('NFKC').toLocaleLowerCase('ja');
  const text = `${sourceText} ${formatText}`;

  if (text.includes('図書館')) return '図書館';
  if (
    sourceText.includes('kindle') ||
    sourceText.includes('電子書籍') ||
    formatText.includes('kindle') ||
    formatText.includes('電子書籍') ||
    formatText.includes('ebook') ||
    formatText.includes('e-book')
  ) {
    return 'Kindle';
  }
  return '紙の本';
}

export function normalizeCatalogSources(catalog) {
  const works = (catalog.works ?? []).map((work) => {
    const formats = work.formats ?? [];
    const sources = (work.sources ?? []).map((source, index) =>
      normalizeSourceGroup(source, formats[index] ?? formats[0] ?? ''),
    );
    return { ...work, sources: [...new Set(sources)] };
  });

  const holdings = (catalog.holdings ?? []).map((holding) => ({
    ...holding,
    source: normalizeSourceGroup(holding.source, holding.format),
  }));

  return { ...catalog, works, holdings };
}

export function normalizeIssueRecords(records = []) {
  return records.map((record) => ({
    ...record,
    holding: record.holding
      ? {
          ...record.holding,
          source: normalizeSourceGroup(record.holding.source, record.holding.format),
        }
      : record.holding,
  }));
}
