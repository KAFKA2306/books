import { normalizeTitle, titleKey } from './catalog.mjs';

export const CANONICAL_CATEGORIES = Object.freeze([
  '未分類',
  '文学・小説',
  '漫画・コミック',
  '投資・金融',
  '投機',
  '経済・社会',
  '経営・ビジネス',
  '科学・技術',
  'コンピュータ・AI',
  'データサイエンス',
  '心理・行動',
  '哲学・思想',
  '歴史・人物',
  '政治・法律',
  '語学・言語',
  '医学・健康',
  'ゲーム・戦略',
  '農業・産業',
  'その他',
]);

const CATEGORY_ALIASES = new Map([
  ['経済', '経済・社会'],
  ['社会科学', '経済・社会'],
  ['経営・会計', '経営・ビジネス'],
  ['商業', '経営・ビジネス'],
  ['科学一般', '科学・技術'],
  ['物理', '科学・技術'],
  ['化学', '科学・技術'],
  ['化学工業', '科学・技術'],
  ['生物学', '科学・技術'],
  ['植物', '科学・技術'],
  ['動物', '科学・技術'],
  ['数学', '科学・技術'],
  ['地球科学', '科学・技術'],
  ['地図・測地', '科学・技術'],
  ['機械工学', '科学・技術'],
  ['技術・工学', '科学・技術'],
  ['資源・金属', '科学・技術'],
  ['情報工学・制御', 'コンピュータ・AI'],
  ['自己啓発・生き方', '心理・行動'],
  ['社会・人間関係', '心理・行動'],
  ['家族・ジェンダー', '経済・社会'],
  ['ゲーム・娯楽', 'ゲーム・戦略'],
  ['歴史', '歴史・人物'],
  ['伝記・人物', '歴史・人物'],
  ['政治', '政治・法律'],
  ['法律', '政治・法律'],
  ['農業', '農業・産業'],
]);

const ROLE_SUFFIX = /\s*(?:著|編|訳|監修|原著|原作|作|文|絵)\s*$/u;
const DATE_SEGMENT = /^(?:\d{4}|\d{4}-\d{0,4}|-\d{4})$/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function clean(value = '') {
  return String(value)
    .normalize('NFKC')
    .replace(/\u3000/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function compactPersonName(value = '') {
  const normalized = clean(value).replace(ROLE_SUFFIX, '').trim();
  return CJK.test(normalized) ? normalized.replace(/\s+/gu, '') : normalized;
}

export function normalizeAuthorDisplay(value = '') {
  const raw = clean(value).replace(/^[,、;\s]+|[,、;\s]+$/gu, '');
  if (!raw) return '';

  const segments = raw
    .split(/\s*[,、]\s*/u)
    .map((segment) => clean(segment))
    .filter(Boolean);

  const roleNames = [...new Set(
    segments
      .filter((segment) => ROLE_SUFFIX.test(segment))
      .map((segment) => compactPersonName(segment))
      .filter(Boolean),
  )];
  if (roleNames.length === 1) return roleNames[0];
  if (roleNames.length > 1) return roleNames.join(' / ');

  const firstDateIndex = segments.findIndex((segment) => DATE_SEGMENT.test(segment));
  if (firstDateIndex === 1 && segments[0]) return compactPersonName(segments[0]);
  if (firstDateIndex === 2 && segments[0] && segments[1]) {
    return compactPersonName(`${segments[0]} ${segments[1]}`);
  }

  const meaningful = segments.filter((segment) => !DATE_SEGMENT.test(segment));
  const unique = [...new Set(meaningful.map((segment) => compactPersonName(segment)).filter(Boolean))];
  if (unique.length === 1) return unique[0];

  return raw.replace(/\s*[,、]\s*/gu, ', ');
}

export function normalizeCategoryDisplay(value = '') {
  const normalized = clean(value);
  if (!normalized) return '';
  return CATEGORY_ALIASES.get(normalized) ?? normalized;
}

function normalizeWork(work) {
  const originalTitle = clean(work.title);
  const title = normalizeTitle(originalTitle);
  const originalAuthor = clean(work.author);
  const author = normalizeAuthorDisplay(originalAuthor);
  const originalCategory = clean(work.category);
  const category = normalizeCategoryDisplay(originalCategory);
  const normalized = { ...work };

  if (title && title !== originalTitle) {
    normalized.title_raw ??= work.title;
    normalized.title = title;
    normalized.title_key = titleKey(title);
  }
  if (author && author !== originalAuthor) {
    normalized.author_raw ??= work.author;
    normalized.author = author;
  }
  if (category && category !== originalCategory) {
    normalized.category_raw ??= work.category;
    normalized.category = category;
  }
  return normalized;
}

function normalizeEdition(edition) {
  if (!edition.title) return { ...edition };
  const originalTitle = clean(edition.title);
  const title = normalizeTitle(originalTitle);
  if (!title || title === originalTitle) return { ...edition };
  return {
    ...edition,
    title_raw: edition.title_raw ?? edition.title,
    title,
  };
}

export function normalizeBibliographicDisplayCatalog(catalog) {
  return {
    ...catalog,
    works: (catalog.works ?? []).map(normalizeWork),
    editions: (catalog.editions ?? []).map(normalizeEdition),
  };
}
