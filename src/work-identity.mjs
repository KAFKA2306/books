export const WORK_IDENTITY_SCHEMA = 'kafka.books.work-identities.v1';

const WORK_TYPES = new Set(['text', 'comic']);

export function workIdentityKey(work) {
  return `${work.title_key}\u0000${work.work_type ?? ''}`;
}

export function applyWorkIdentities(catalog, overlay) {
  if (!overlay || overlay.schema !== WORK_IDENTITY_SCHEMA || !Array.isArray(overlay.records)) {
    throw new Error(`invalid work identity schema: ${overlay?.schema ?? 'missing'}`);
  }

  const byWorkId = new Map();
  for (const record of overlay.records) {
    if (!record?.work_id || !record?.work_type) throw new Error('work identity requires work_id and work_type');
    if (!WORK_TYPES.has(record.work_type)) throw new Error(`unsupported work_type: ${record.work_type}`);
    if (!record.source_url?.startsWith('https://')) throw new Error(`work identity requires HTTPS source_url: ${record.work_id}`);
    if (record.adaptation_of_work_id === record.work_id) throw new Error(`work cannot adapt itself: ${record.work_id}`);
    if (byWorkId.has(record.work_id)) throw new Error(`duplicate work identity: ${record.work_id}`);
    byWorkId.set(record.work_id, record);
  }

  const workIds = new Set(catalog.works.map((work) => work.work_id));
  for (const record of overlay.records) {
    if (!workIds.has(record.work_id)) throw new Error(`work identity work not found: ${record.work_id}`);
    if (record.adaptation_of_work_id && !workIds.has(record.adaptation_of_work_id)) {
      throw new Error(`adaptation target not found: ${record.adaptation_of_work_id}`);
    }
  }

  const works = catalog.works.map((work) => {
    const record = byWorkId.get(work.work_id);
    if (!record) return { ...work, work_type: work.work_type ?? null };
    return {
      ...work,
      work_type: record.work_type,
      adaptation_of_work_id: record.adaptation_of_work_id ?? null,
      identity_source_url: record.source_url,
    };
  });

  return {
    ...catalog,
    works,
    work_identity_audit: overlay.records.map((record) => ({ ...record })),
  };
}
