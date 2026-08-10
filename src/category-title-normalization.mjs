export const CATEGORY_TITLE_NORMALIZATION_VERSION = 'bibliographic-suffix-v1';

const TRAILING_SERIES_LABEL = /\s*[（(][^()（）]{0,80}(?:コミックス?|コミック|文庫|新書|叢書|シリーズ)[^()（）]*[)）]\s*$/u;
const TRAILING_PAREN_VOLUME = /\s*[（(]\s*(?:第\s*)?\d+(?:\.\d+)?\s*(?:巻|話)?\s*[)）]\s*$/u;
const TRAILING_JAPANESE_VOLUME = /\s+第?\s*\d+(?:\.\d+)?\s*巻\s*$/u;

export function normalizeCategoryLookupTitle(value) {
  let title = String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!title) return '';

  let previous;
  do {
    previous = title;
    title = title
      .replace(TRAILING_SERIES_LABEL, '')
      .replace(TRAILING_PAREN_VOLUME, '')
      .replace(TRAILING_JAPANESE_VOLUME, '')
      .trim();
  } while (title && title !== previous);

  return title;
}

export function normalizeCategorySearchRecords(records) {
  return records.map((record) => ({
    ...record,
    title: normalizeCategoryLookupTitle(record.title),
  }));
}
