import fs from 'node:fs/promises';
import path from 'node:path';

export async function readKindleMetadata(root = process.cwd()) {
  const dir = path.join(root, 'data', 'kindle');
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }

  const records = [];
  for (const part of manifest.parts ?? []) {
    const text = await fs.readFile(path.join(dir, part), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      records.push(JSON.parse(line));
    }
  }
  if (records.length !== manifest.record_count) {
    throw new Error(`Kindle record count mismatch: manifest=${manifest.record_count}, loaded=${records.length}`);
  }
  return { ...manifest, records };
}

export async function writeKindleMetadata(snapshot, outputDir, { partSize = 100 } = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const stale = (await fs.readdir(outputDir)).filter((name) => /^records-\d+\.ndjson$/.test(name));
  await Promise.all(stale.map((name) => fs.rm(path.join(outputDir, name))));

  const parts = [];
  for (let offset = 0, index = 1; offset < snapshot.records.length; offset += partSize, index += 1) {
    const name = `records-${String(index).padStart(2, '0')}.ndjson`;
    const rows = snapshot.records.slice(offset, offset + partSize);
    await fs.writeFile(path.join(outputDir, name), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    parts.push(name);
  }

  const manifest = {
    schema: snapshot.schema,
    source: snapshot.source,
    source_sync_time: snapshot.source_sync_time,
    raw_record_count: snapshot.raw_record_count,
    record_count: snapshot.record_count,
    part_size: partSize,
    parts,
  };
  await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
