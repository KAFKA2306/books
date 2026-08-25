const COMMERCIAL_BRACKET = /【[^】]*(?:期間限定|無料版?|モノクロ版|カラー版|分冊版|合本版|特装版|限定版|電子限定|先行試し読み|試し読み|見本|ダイジェスト版|単話売|短編|旧版|同人版)[^】]*】/gu;
const TRAILING_IMPRINT = /\s*(?:\(|（)[^()（）]*(?:コミックス|コミック|文庫|新書|DIGITAL)[^()（）]*(?:\)|）)\s*$/iu;
const TRAILING_VOLUME = /(?:\s*(?:\(|（)\s*\d{1,3}\s*(?:\)|）)|\s*第?\d{1,3}\s*(?:巻|冊))\s*$/u;
const TRAILING_COMMERCIAL = /\s*(?:期間限定(?:無料)?|無料版|モノクロ版|カラー版|分冊版|合本版|特装版|限定版)\s*$/u;

function compact(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function deriveReviewBaseTitle(value) {
  let title = String(value ?? '').normalize('NFKC').trim();
  if (!title) return '';

  title = title.replace(COMMERCIAL_BRACKET, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i += 1) {
    const previous = title;
    title = title
      .replace(TRAILING_IMPRINT, '')
      .replace(TRAILING_COMMERCIAL, '')
      .replace(TRAILING_VOLUME, '')
      .trim();
    if (title === previous) break;
  }
  return title;
}

export function buildTitleReviewBatch(rows) {
  const groups = new Map();
  for (const row of rows ?? []) {
    const baseTitle = deriveReviewBaseTitle(row.title);
    const titleKey = compact(baseTitle);
    const authorKey = compact(row.author);
    if (!titleKey) continue;

    const key = `${titleKey}\u0000${authorKey}`;
    const group = groups.get(key) ?? {
      base_title: baseTitle,
      author: row.author ?? null,
      members: [],
    };
    group.members.push({
      work_id: row.work_id,
      title: row.title,
      author: row.author ?? null,
      reasons: [...(row.reasons ?? [])],
    });
    groups.set(key, group);
  }

  const reviewGroups = [...groups.values()].map((group) => ({
    ...group,
    member_count: group.members.length,
    review_type: group.members.length > 1 ? 'series_cluster' : 'single_candidate',
    members: group.members.sort((a, b) => String(a.title).localeCompare(String(b.title), 'ja')),
  }));

  reviewGroups.sort((a, b) => b.member_count - a.member_count
    || String(a.base_title).localeCompare(String(b.base_title), 'ja')
    || String(a.author ?? '').localeCompare(String(b.author ?? ''), 'ja'));

  return {
    schema: 'kafka.books.title-review-batch.v1',
    candidate_count: reviewGroups.reduce((sum, group) => sum + group.member_count, 0),
    group_count: reviewGroups.length,
    multi_work_group_count: reviewGroups.filter((group) => group.member_count > 1).length,
    groups: reviewGroups,
  };
}
