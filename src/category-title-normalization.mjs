export const CATEGORY_TITLE_NORMALIZATION_VERSION = 'bibliographic-suffix-v8';

const TRAILING_SERIES_LABEL = /\s*[（(][^()（）]{0,80}(?:コミックス?|コミック|文庫|新書|叢書|シリーズ)[^()（）]*[)）]\s*$/u;
const TRAILING_PAREN_VOLUME = /\s*[（(]\s*(?:第\s*)?\d+(?:\.\d+)?\s*(?:巻|話)?\s*[)）]\s*$/u;
const TRAILING_JAPANESE_VOLUME = /\s+第?\s*\d+(?:\.\d+)?\s*巻\s*$/u;
const TRAILING_PLAIN_VOLUME = /\s+\d+(?:\.\d+)?\s*$/u;
const TRAILING_RETAIL_EDITION = /\s*[（(]\s*(?:English Edition|Kindle版|電子書籍版)\s*[)）]\s*$/iu;
const TRAILING_ENGLISH_SERIES_VOLUME = /\s*[（(][^()（）]{0,80}\bBook\s+\d+(?:\.\d+)?\s*[)）]\s*$/iu;
const TRAILING_RETAIL_PUBLISHER = /\s*[（(][^()（）]{1,48}(?:書房|出版社?|出版局|ブックス)[)）]\s*$/u;
const RETAIL_QUOTED_MAIN_WITH_SUBTITLE = /^(.*?[」』】][^\s]{1,20})\s+\S.{3,}$/u;
const INLINE_LIMITED_FREE_LABEL = /\s*【\s*期間限定無料(?:版)?\s*】\s*/gu;
const HAS_INLINE_LIMITED_FREE_LABEL = /【\s*期間限定無料(?:版)?\s*】/u;
const RETAIL_MONOCHROME_LABEL = /(?:^|\s)モノクロ版(?=\s|【|$)/gu;
const HAS_RETAIL_MONOCHROME_LABEL = /(?:^|\s)モノクロ版(?=\s|【|$)/u;
const TRAILING_BRACKET_SERIES_POSITION = /\s*【[^】]{0,80}(?:シリーズ)?第\s*\d+\s*弾】\s*$/u;
const BIBLIOGRAPHIC_SUBTITLE_SEPARATORS = [/\s+[:：]\s+/u, /―(?=\S{4,}$)/u, /\s+──(?=\S{4,}$)/u];
const JAPANESE_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const MIN_SEARCH_PREFIX_LENGTH = 6;
const MIN_SEARCH_REMAINDER_LENGTH = 6;

function stripBibliographicSubtitle(title) {
  const indices = BIBLIOGRAPHIC_SUBTITLE_SEPARATORS
    .map((pattern) => title.search(pattern))
    .filter((index) => index >= 6);
  if (!indices.length) return title;
  return title.slice(0, Math.min(...indices)).trim();
}

export function normalizeCategoryLookupTitle(value) {
  let title = String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!title) return '';

  const hadRetailPublisherSuffix = TRAILING_RETAIL_PUBLISHER.test(title);
  if (hadRetailPublisherSuffix) title = title.replace(TRAILING_RETAIL_PUBLISHER, '').trim();

  // NDL often serializes subtitles with a spaced colon, while retailer titles can use
  // a Japanese horizontal bar or double dash for the same boundary. Strip only when
  // the main title is already substantial; short punctuation-bearing titles stay intact.
  title = stripBibliographicSubtitle(title);

  // Some retailer exports append a publisher in parentheses and flatten NDL's subtitle
  // separator into a plain space. Only after a publisher suffix was positively identified,
  // recover the quoted main title. The accepted NDL record still has to satisfy the
  // category decision rules after normalization.
  if (hadRetailPublisherSuffix) {
    const quotedMain = title.match(RETAIL_QUOTED_MAIN_WITH_SUBTITLE)?.[1];
    if (quotedMain?.length >= 8) title = quotedMain;
  }

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
      .replace(TRAILING_RETAIL_EDITION, '')
      .replace(TRAILING_ENGLISH_SERIES_VOLUME, '')
      .replace(TRAILING_SERIES_LABEL, '')
      .replace(TRAILING_BRACKET_SERIES_POSITION, '')
      .replace(TRAILING_PAREN_VOLUME, '')
      .replace(TRAILING_JAPANESE_VOLUME, '')
      .trim();
    if (mayStripPlainVolume) title = title.replace(TRAILING_PLAIN_VOLUME, '').trim();
  } while (title && title !== previous);

  return title;
}

export function categorySearchFallbackTitle(value) {
  const title = normalizeCategoryLookupTitle(value);
  const boundary = title.indexOf(' ');
  if (boundary < 0) return null;
  const prefix = title.slice(0, boundary).trim();
  const remainder = title.slice(boundary + 1).trim();
  if (prefix.length < MIN_SEARCH_PREFIX_LENGTH || remainder.length < MIN_SEARCH_REMAINDER_LENGTH) return null;
  if (!JAPANESE_CHARACTER.test(prefix)) return null;
  return prefix;
}

export function normalizeCategorySearchRecords(records) {
  return records.map((record) => ({
    ...record,
    title: normalizeCategoryLookupTitle(record.title),
  }));
}
