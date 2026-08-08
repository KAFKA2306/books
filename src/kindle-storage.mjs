import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ORIGIN_MAP = new Map([
  ['Purchase', 'purchase'],
  ['Sample', 'sample'],
  ['Prime', 'prime'],
  ['KindleDictionary', 'kindle_dictionary'],
]);

function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function recordKey(record) {
  const copy = { ...record };
  delete copy.ordinal;
  delete copy.record_id;
  return JSON.stringify(copy);
}

export function dedupeKindleRecords(records) {
  const seen = new Set();
  const output = [];
  for (const record of records) {
    const key = recordKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ ...record, ordinal: output.length + 1 });
  }
  return output;
}

function inflateCompactRow(row, fields, ordinal) {
  if (!Array.isArray(row)) return row;
  const value = Object.fromEntries(fields.map((field, index) => [field, row[index] ?? null]));
  return {
    ordinal,
    asin: value.asin,
    title: value.title,
    authors: value.authors ?? [],
    publishers: value.publishers ?? [],
    publication_date: value.publication_date ?? null,
    acquired_at: value.acquired_at ?? null,
    origin_type: ORIGIN_MAP.get(value.acquisition_type) ?? 'unknown',
    cde_contenttype: value.cde_contenttype ?? null,
    content_type: value.content_type ?? null,
    textbook_type: value.textbook_type ?? null,
  };
}

export async function loadCompactKindleMetadata(root, manifest) {
  if (manifest.storage !== 'compact-ndjson-array') {
    throw new Error(`Unsupported compact Kindle storage: ${manifest.storage}`);
  }
  if (!Array.isArray(manifest.fields) || !manifest.fields.length) {
    throw new Error('Compact Kindle manifest lacks fields');
  }

  const dir = path.join(root, 'data', 'kindle');
  const records = [];
  let ordinal = 0;
  for (const part of manifest.parts ?? []) {
    const partName = typeof part === 'string' ? part : part.name;
    const filePath = path.join(dir, partName);
    const content = await fs.readFile(filePath, 'utf8');
    if (typeof part === 'object') {
      if (part.bytes !== undefined && Buffer.byteLength(content) !== part.bytes) {
        throw new Error(`Kindle part byte-size mismatch: ${partName}`);
      }
      if (part.sha256 && hash(content) !== part.sha256) {
        throw new Error(`Kindle part hash mismatch: ${partName}`);
      }
    }
    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    if (typeof part === 'object' && part.records !== undefined && lines.length !== part.records) {
      throw new Error(`Kindle part record-count mismatch: ${partName}`);
    }
    for (const line of lines) {
      ordinal += 1;
      records.push(inflateCompactRow(JSON.parse(line), manifest.fields, ordinal));
    }
  }

  if (records.length !== manifest.record_count) {
    throw new Error(`Kindle manifest count mismatch: ${records.length} != ${manifest.record_count}`);
  }
  if (new Set(records.map((record) => record.asin)).size !== manifest.unique_asin_count) {
    throw new Error('Kindle manifest ASIN count mismatch');
  }
  return { manifest, records };
}
