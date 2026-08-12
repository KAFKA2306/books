const COMMERCIAL_ANNOTATION = /(?:【[^】]{1,80}】|期間限定(?:無料)?|無料版|モノクロ版|カラー版|分冊版|合本版|特装版|限定版)/u;
const VOLUME_METADATA = /(?:\(|（)\s*\d{1,3}\s*(?:\)|）)|(?:^|\s)第?\d{1,3}\s*(?:巻|冊)(?:\s|$)|\s\d{1,3}\s+(?=\([^)]*(?:コミックス|コミック|DIGITAL)[^)]*\)\s*$)/iu;
const FORMAT_MARKER = /(?:Kindle版|電子書籍版|単行本版|文庫版|コミック版)/iu;
const IMPRINT_SUFFIX = /(?:コミックス|コミック|文庫|新書|DIGITAL)(?:\)|）|】)?\s*$/iu;
const ROLE_SUFFIX = /(?:著|訳|監修|編著|編|原著|原作)\s*$/u;

function compact(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function authorTokens(author) {
  if (!author) return [];
  return String(author)
    .split(/\s*(?:\/|,|、|・and・| and )\s*/iu)
    .map((value) => value.trim())
    .filter((value) => value.length >= 2);
}

export function detectTitleAnomalies(work) {
  const title = String(work?.title ?? '').trim();
  if (!title) return [];

  const reasons = [];
  if (COMMERCIAL_ANNOTATION.test(title)) reasons.push('commercial_annotation');
  if (VOLUME_METADATA.test(title)) reasons.push('volume_metadata');
  if (FORMAT_MARKER.test(title)) reasons.push('format_marker');
  if (IMPRINT_SUFFIX.test(title)) reasons.push('imprint_or_series_suffix');
  if (ROLE_SUFFIX.test(title)) reasons.push('creator_role_suffix');

  const titleCompact = compact(title);
  for (const token of authorTokens(work?.author)) {
    const tokenCompact = compact(token);
    if (tokenCompact.length >= 3 && titleCompact.length >= tokenCompact.length + 3 && titleCompact.endsWith(tokenCompact)) {
      reasons.push('author_appended_to_title');
      break;
    }
  }

  return [...new Set(reasons)];
}

export function auditTitleAnomalies(works) {
  return (works ?? [])
    .map((work) => ({
      work_id: work.work_id,
      title: work.title,
      author: work.author ?? null,
      reasons: detectTitleAnomalies(work),
    }))
    .filter((row) => row.reasons.length)
    .sort((a, b) => b.reasons.length - a.reasons.length || String(a.title).localeCompare(String(b.title), 'ja'));
}
