import { canonicalIsbn13, diceSimilarity } from './catalog.mjs';

export const CATEGORY_RULE_VERSION = 'ndc-map-v1';

const decodeEntities = (value = '') => String(value)
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

const stripMarkup = (value = '') => decodeEntities(
  String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' '),
).replace(/\s+/g, ' ').trim();

const firstTag = (xml, localName) => {
  const pattern = new RegExp(
    `<(?:(?:[\\w.-]+):)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${localName}>`,
    'i',
  );
  const match = String(xml).match(pattern);
  return match ? stripMarkup(match[1]) : null;
};

const allTags = (xml, localName) => {
  const pattern = new RegExp(
    `<(?:(?:[\\w.-]+):)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${localName}>`,
    'gi',
  );
  return [...String(xml).matchAll(pattern)].map((match) => stripMarkup(match[1])).filter(Boolean);
};

const unique = (values) => [...new Set(values.filter(Boolean))];

function identifiersFromText(text) {
  const matches = String(text).match(/(?:97[89][\s-]?)?(?:\d[\s-]?){8,11}[\dX]/gi) ?? [];
  return unique(matches.map(canonicalIsbn13));
}

export function normalizeNdcCode(value) {
  const decoded = decodeURIComponent(String(value ?? '').trim());
  const match = decoded.match(/\d{1,3}(?:\.\d+)?/);
  if (!match) return null;
  const [integer, decimal] = match[0].split('.');
  return `${integer.padStart(3, '0')}${decimal ? `.${decimal}` : ''}`;
}

function ndcValuesFromItem(item) {
  const values = [];
  for (const match of String(item).matchAll(/http:\/\/id\.ndl\.go\.jp\/class\/(ndc10|ndc9)\/([^"'<>&\s]+)/gi)) {
    const code = normalizeNdcCode(match[2]);
    if (code) values.push({ scheme: match[1].toUpperCase(), code });
  }

  const subjectPattern = /<(?:(?:[\w.-]+):)?subject\b([^>]*)>([\s\S]*?)<\/(?:(?:[\w.-]+):)?subject>/gi;
  for (const match of String(item).matchAll(subjectPattern)) {
    const attributes = match[1];
    if (/NDLC/i.test(attributes) || !/NDC(?:8|9|10)?\b/i.test(attributes)) continue;
    const code = normalizeNdcCode(stripMarkup(match[2]));
    if (!code) continue;
    const schemeMatch = attributes.match(/NDC(10|9|8)?\b/i);
    values.push({ scheme: `NDC${schemeMatch?.[1] ?? ''}`, code });
  }

  const seen = new Set();
  return values.filter((entry) => {
    const key = `${entry.scheme}:${entry.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseNdlCategorySearch(xml) {
  const items = [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .map((match) => match[1]);

  return items.map((item) => {
    const typedIdentifiers = [...item.matchAll(
      /<(?:(?:[\w.-]+):)?identifier\b[^>]*(?:ISBN|isbn)[^>]*>([\s\S]*?)<\/(?:(?:[\w.-]+):)?identifier>/gi,
    )].flatMap((match) => identifiersFromText(stripMarkup(match[1])));
    const explicitIdentifiers = allTags(item, 'ISBN').flatMap(identifiersFromText);
    return {
      provider: 'ndl',
      title: firstTag(item, 'title'),
      authors: unique([...allTags(item, 'creator'), ...allTags(item, 'author')]),
      isbns: unique([...typedIdentifiers, ...explicitIdentifiers]),
      ndc: ndcValuesFromItem(item),
      source_url: firstTag(item, 'link'),
    };
  }).filter((record) => record.title);
}

export function categoryForNdc(value) {
  const code = normalizeNdcCode(value);
  if (!code) return null;

  if (code.startsWith('007')) return 'コンピュータ・AI';
  if (code.startsWith('019')) return '読書・書評';
  if (code.startsWith('141')) return '心理・行動';
  if (code.startsWith('159')) return '自己啓発・生き方';
  if (code.startsWith('289')) return '伝記・人物';
  if (code.startsWith('290')) return '地理・旅行';
  if (code.startsWith('304')) return '社会・時事';
  if (code.startsWith('312') || code.startsWith('310')) return '政治';
  if (code.startsWith('319')) return '国際関係・地政学';
  if (code.startsWith('338')) return '投資・金融';
  if (code.startsWith('336')) return '経営・会計';
  if (code.startsWith('335')) return '経営・ビジネス';
  if (code.startsWith('337')) return '通貨・物価';
  if (code.startsWith('339')) return '保険';
  if (code.startsWith('361')) return '社会・人間関係';
  if (code.startsWith('366')) return 'キャリア・労働';
  if (code.startsWith('367')) return '家族・ジェンダー';
  if (code.startsWith('369')) return '福祉・社会保障';
  if (code.startsWith('410')) return '数学';
  if (code.startsWith('420')) return '物理';
  if (code.startsWith('430')) return '化学';
  if (code.startsWith('440')) return '天文・宇宙';
  if (code.startsWith('450')) return '地球科学';
  if (code.startsWith('460')) return '生物学';
  if (code.startsWith('470')) return '植物';
  if (code.startsWith('480')) return '動物';
  if (code.startsWith('490')) return '医学・健康';
  if (code.startsWith('547')) return '情報通信・ネットワーク';
  if (code.startsWith('548')) return '情報工学・制御';
  if (code.startsWith('726')) return '漫画・コミック';
  if (code.startsWith('780')) return 'スポーツ';
  if (code.startsWith('790')) return 'ゲーム・娯楽';

  const division = Number(code.slice(0, 2));
  if (division === 0) return '総記・情報';
  if (division === 1) return '図書館・書誌';
  if (division >= 10 && division <= 13) return '哲学・思想';
  if (division === 14) return '心理・行動';
  if (division === 15) return '倫理・人生';
  if (division >= 16 && division <= 19) return '宗教・思想';
  if (division >= 20 && division <= 27) return '歴史';
  if (division === 28) return '伝記・人物';
  if (division === 29) return '地理・旅行';
  if (division === 30) return '社会科学';
  if (division === 31) return '政治';
  if (division === 32) return '法律';
  if (division === 33) return '経済';
  if (division === 34) return '財政';
  if (division === 35) return '統計';
  if (division === 36) return '社会・労働・福祉';
  if (division === 37) return '教育';
  if (division === 38) return '民俗・文化';
  if (division === 39) return '軍事・安全保障';
  if (division === 40) return '科学一般';
  if (division === 41) return '数学';
  if (division === 42) return '物理';
  if (division === 43) return '化学';
  if (division === 44) return '天文・宇宙';
  if (division === 45) return '地球科学';
  if (division === 46) return '生物学';
  if (division === 47) return '植物';
  if (division === 48) return '動物';
  if (division === 49) return '医学・健康';
  if (division === 50) return '技術・工学';
  if (division === 51) return '土木・都市';
  if (division === 52) return '建築';
  if (division === 53) return '機械工学';
  if (division === 54) return '電気・電子';
  if (division === 55) return '船舶・海洋工学';
  if (division === 56) return '資源・金属';
  if (division === 57) return '化学工業';
  if (division === 58) return '製造・工業';
  if (division === 59) return '生活・家政';
  if (division === 60) return '産業';
  if (division === 61) return '農業';
  if (division === 62) return '園芸';
  if (division === 63) return '農業・蚕糸';
  if (division === 64) return '畜産';
  if (division === 65) return '林業';
  if (division === 66) return '水産';
  if (division === 67) return '商業';
  if (division === 68) return '交通';
  if (division === 69) return '通信・メディア';
  if (division === 70) return '芸術';
  if (division === 71) return '彫刻';
  if (division === 72 || division === 73) return '美術・絵画';
  if (division === 74) return '写真・印刷';
  if (division === 75) return '工芸';
  if (division === 76) return '音楽';
  if (division === 77) return '映画・演劇';
  if (division === 78) return 'スポーツ';
  if (division === 79) return 'ゲーム・娯楽';
  if (division >= 80 && division <= 89) return '語学・言語';
  if (division >= 90 && division <= 99) return '文学・小説';
  return null;
}

function firstMappableNdc(record) {
  for (const ndc of record.ndc ?? []) {
    const category = categoryForNdc(ndc.code);
    if (category) return { ...ndc, category };
  }
  return null;
}

export function decideCategory(work, records, { isbn13s = [], titleThreshold = 0.97 } = {}) {
  const expectedIsbns = new Set(isbn13s.map(canonicalIsbn13).filter(Boolean));
  const isbnMode = expectedIsbns.size > 0;
  const matches = records
    .map((record) => ({
      record,
      similarity: diceSimilarity(work.title, record.title ?? ''),
      ndc: firstMappableNdc(record),
    }))
    .filter(({ record, similarity }) => (
      isbnMode
        ? record.isbns.some((isbn) => expectedIsbns.has(canonicalIsbn13(isbn)))
        : similarity >= titleThreshold
    ));

  if (!matches.length) return { outcome: 'no_candidate', accepted: null, matches: 0 };
  const categorized = matches.filter((match) => match.ndc);
  if (!categorized.length) return { outcome: 'no_ndc', accepted: null, matches: matches.length };

  const categories = unique(categorized.map((match) => match.ndc.category));
  if (categories.length !== 1) {
    return { outcome: 'ambiguous', accepted: null, matches: matches.length, categories };
  }

  categorized.sort((left, right) => (
    (left.record.source_url ?? '').localeCompare(right.record.source_url ?? '')
    || right.similarity - left.similarity
    || left.ndc.code.localeCompare(right.ndc.code)
  ));
  const winner = categorized[0];
  return {
    outcome: 'accepted',
    matches: matches.length,
    accepted: {
      category: winner.ndc.category,
      ndc_scheme: winner.ndc.scheme,
      ndc_code: winner.ndc.code,
      source_url: winner.record.source_url,
      match_mode: isbnMode ? 'isbn' : 'title',
      title_similarity: winner.similarity,
      rule_version: CATEGORY_RULE_VERSION,
    },
  };
}

export function eligibleCategoryWorks(catalog, state, now = new Date()) {
  const attempts = state?.attempts ?? {};
  return catalog.works
    .filter((work) => work.category === '未分類')
    .filter((work) => {
      const nextAttempt = attempts[work.work_id]?.next_attempt_at;
      return !nextAttempt || new Date(nextAttempt) <= now;
    })
    .sort((left, right) => left.work_id.localeCompare(right.work_id));
}

export function applyCategoryEnrichments(catalog, overlay) {
  const records = Array.isArray(overlay?.records) ? overlay.records : [];
  if (!records.length) {
    return {
      ...catalog,
      stats: {
        ...catalog.stats,
        category_enriched_count: 0,
        uncategorized_count: catalog.works.filter((work) => work.category === '未分類').length,
      },
    };
  }

  const works = catalog.works.map((work) => ({ ...work }));
  const workById = new Map(works.map((work) => [work.work_id, work]));
  let applied = 0;

  for (const record of records) {
    const work = workById.get(record.work_id);
    if (!work) throw new Error(`Unknown category enrichment work: ${record.work_id}`);
    if (!record.category || !record.ndc_code || record.rule_version !== CATEGORY_RULE_VERSION) {
      throw new Error(`Invalid category enrichment record: ${record.work_id}`);
    }
    if (work.category !== '未分類') continue;
    work.category = record.category;
    work.classification = {
      scheme: record.ndc_scheme,
      code: record.ndc_code,
      source: 'ndl_search',
      source_url: record.source_url,
      method: record.rule_version,
      match_mode: record.match_mode,
      title_similarity: record.title_similarity,
      verified_at: record.verified_at,
    };
    applied += 1;
  }

  return {
    ...catalog,
    works,
    stats: {
      ...catalog.stats,
      category_enriched_count: applied,
      uncategorized_count: works.filter((work) => work.category === '未分類').length,
    },
  };
}

export function categoryRetryAfter(outcome, now = new Date()) {
  const days = {
    accepted: 3650,
    ambiguous: 30,
    no_ndc: 30,
    no_candidate: 14,
    provider_error: 1,
  }[outcome] ?? 7;
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}
