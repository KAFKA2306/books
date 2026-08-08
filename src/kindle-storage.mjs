import fs from 'node:fs/promises';
import path from 'node:path';

export const KINDLE_RECORD_FIELDS = [
  'record_id',
  'asin',
  'title',
  'authors',
  'publishers',
  'publication_date',
  'acquired_at',
  'cde_contenttype',
  'content_type',
  'acquisition_type',
];

function inflateRow(row, fields) {
  if (!Array.isArray(row)) return row;
  return Object.fromEntries(fields.map((field, index) => [field, row[index] ?? null]));
}

export async function readKindleMetadata(root = process.cwd()) {
  const dir = path.join(root, 'data', 'kindle');
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }

  const fields = manifest.fields ?? KINDLE_RECORD_FIELDS;
  const records = [];
  for (const part of manifest.parts ?? []) {
    const text = await fs.readFile(path.join(dir, part), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      records.push(inflateRow(JSON.parse(line), fields));
    }
  }
  if (records.length !== manifest.record_count) {
    throw new Error(`Kindle record count mismatch: manifest=${manifest.record_count}, loaded=${records.length}`);
  }
  return { ...manifest, records };
}

export async function writeKindleMetadata(snapshot, outputDir, { partSize = 50 } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const stale = (await fs.readdir(outputDir)).filter((name) => /^records-\d+\.ndjson$/.test(name));
  await Promise.all(stale.map((name) => fs.rm(path.join(outputDir, name))));

  const parts = [];
  for (let offset = 0, index = 1; offset < snapshot.records.length; offset += partSize, index += 1) {
    const name = `records-${String(index).padStart(2, '0')}.ndjson`;
    const rows = snapshot.records.slice(offset, offset + partSize);
    const compactRows = rows.map((row) => KINDLE_RECORD_FIELDS.map((field) => row[field] ?? null));
    await fs.writeFile(path.join(outputDir, name), `${compactRows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    parts.push(name);
  }

  const manifest = {
    schema: snapshot.schema,
    source: snapshot.source,
    source_sync_time: snapshot.source_sync_time,
    raw_record_count: snapshot.raw_record_count,
    record_count: snapshot.record_count,
    storage: 'compact-ndjson-array',
    fields: KINDLE_RECORD_FIELDS,
    part_size: partSize,
    parts,
  };
  await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
