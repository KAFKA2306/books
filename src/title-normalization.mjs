import { titleKey } from './catalog.mjs';

export const TITLE_NORMALIZATION_SCHEMA = 'kafka.books.title-normalizations.v1';

export function applyTitleNormalizations(catalog, overlay) {
  if (!overlay || overlay.schema !== TITLE_NORMALIZATION_SCHEMA) {
    throw new Error(`invalid title normalization schema: ${overlay?.schema ?? 'missing'}`);
  }

  const records = overlay.records ?? [];
  const byWorkId = new Map();
  for (const record of records) {
    if (!record?.work_id || !record?.title) throw new Error('title normalization requires work_id and title');
    if (!record.source_url?.startsWith('https://')) throw new Error(`title normalization requires HTTPS source_url: ${record.work_id}`);
    if (byWorkId.has(record.work_id)) throw new Error(`duplicate title normalization: ${record.work_id}`);
    byWorkId.set(record.work_id, record);
  }

  const seen = new Set();
  const works = catalog.works.map((work) => {
    const record = byWorkId.get(work.work_id);
    if (!record) return work;
    seen.add(work.work_id);
    if (record.from_title && work.title !== record.from_title) {
      throw new Error(`title normalization drift for ${work.work_id}: expected ${record.from_title}, got ${work.title}`);
    }
    return {
      ...work,
      title: record.title,
      title_key: titleKey(record.title),
      author: record.author ?? work.author ?? null,
    };
  });

  for (const workId of byWorkId.keys()) {
    if (!seen.has(workId)) throw new Error(`title normalization work not found: ${workId}`);
  }

  return { ...catalog, works };
}
