export const CATEGORY_TITLE_NORMALIZATION_VERSION = 'bibliographic-suffix-v2';

const TRAILING_SERIES_LABEL = /\s*[（(][^()（）]{0,80}(?:コミックス?|コミック|文庫|新書|叢書|シリーズ)[^()（）]*[)）]\s*$/u;
const TRAILING_PAREN_VOLUME = /\s*[（(]\s*(?:第\s*)?\d+(?:\.\d+)?\s*(?:巻|話)?\s*[)）]\s*$/u;
const TRAILING_JAPANESE_VOLUME = /\s+第?\s*\d+(?:\.\d+)?\s*巻\s*$/u;
const TRAILING_PLAIN_VOLUME = /\s+\d+(?:\.\d+)?\s*$/u;
const INLINE_LIMITED_FREE_LABEL = /\s*【\s*期間限定無料(?:版)?\s*】\s*/gu;
const HAS_INLINE_LIMITED_FREE_LABEL = /【\s*期間限定無料(?:版)?\s*】/u;
const RETAIL_MONOCHROME_LABEL = /(?:^|\s)モノクロ版(?=\s|【|$)/gu;
const HAS_RETAIL_MONOCHROME_LABEL = /(?:^|\s)モノクロ版(?=\s|【|$)/u;
const TRAILING_BRACKET_SERIES_POSITION = /\s*【[^】]{0,80}(?:シリーズ)?第\s*\d+\s*弾】\s*$/u;

export function normalizeCategoryLookupTitle(value) {
  let title = String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!title) return '';

  // Only allow a bare trailing number to be removed when the original value contains
  // a known retail/bibliographic decoration that makes the number unambiguously a volume.
  const mayStripPlainVolume = TRAILING_SERIES_LABEL.test(title)
    || HAS_INLINE_LIMITED_FREE_LABEL.test(title)
    || HAS_RETAIL_MONOCHROME_LABEL.test(title);

  title = title
    .replace(INLINE_LIMITED_FREE_LABEL, ' ')
    .replace(RETAIL_MONOCHROME_LABEL, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  let previous;
  do {
    previous = title;
    title = title
      .replace(TRAILING_SERIES_LABEL, '')
      .replace(TRAILING_BRACKET_SERIES_POSITION, '')
      .replace(TRAILING_PAREN_VOLUME, '')
      .replace(TRAILING_JAPANESE_VOLUME, '')
      .trim();
    if (mayStripPlainVolume) title = title.replace(TRAILING_PLAIN_VOLUME, '').trim();
  } while (title && title !== previous);

  return title;
}

export function normalizeCategorySearchRecords(records) {
  return records.map((record) => ({
    ...record,
    title: normalizeCategoryLookupTitle(record.title),
  }));
}
