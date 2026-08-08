import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const dataDir = path.join(root, 'data');

async function decodeParts(manifestName) {
  const manifest = JSON.parse(await fs.readFile(path.join(dataDir, manifestName), 'utf8'));
  if (!Array.isArray(manifest.parts) || !manifest.parts.length) {
    throw new Error(`${manifestName}: parts is empty`);
  }
  const chunks = await Promise.all(
    manifest.parts.map((part) => fs.readFile(path.join(dataDir, part), 'utf8')),
  );
  const encoded = chunks.join('').replace(/\s/g, '');
  return JSON.parse(zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'));
}

function expandCompactCatalog(compact) {
  const works = compact.w.map(([
    work_id,
    title,
    title_key,
    category,
    status,
    progress,
    rating,
    price_yen,
    acquired_at,
    item_count,
    sources,
    formats,
  ]) => ({
    work_id,
    title,
    title_key,
    author: null,
    category,
    status,
    progress,
    rating,
    price_yen,
    acquired_at,
    item_count,
    isbn_count: 0,
    isbn_status: 'missing',
    sources,
    formats,
  }));

  const editions = works.map((work) => ({
    edition_id: `pending:${work.work_id.slice(4)}`,
    id_kind: 'pending_title_key',
    work_id: work.work_id,
    isbn13: null,
    isbn10: null,
    language: null,
    publisher: null,
    published_year: null,
    format: null,
    verification: 'unverified',
  }));

  const holdings = works.flatMap((work) => work.sources.map((source, index) => ({
    holding_id: `${work.work_id}:h${index + 1}`,
    work_id: work.work_id,
    edition_id: `pending:${work.work_id.slice(4)}`,
    source,
    format: work.formats[index] ?? work.formats[0] ?? '不明',
    quantity: index === 0 ? work.item_count : 1,
    acquired_at: work.acquired_at,
    price_yen: index === 0 ? work.price_yen : null,
    progress: index === 0 ? work.progress : null,
    rating: index === 0 ? work.rating : null,
  })));

  return {
    schema_version: compact.v,
    generated_at: compact.g,
    key_policy: {
      work: 'deterministic normalized title hash',
      edition: 'verified ISBN-13 preferred',
    },
    stats: {
      ...compact.s,
      edition_count: editions.length,
      holding_count: holdings.length,
    },
    works,
    editions,
    holdings,
  };
}

const compactCatalog = await decodeParts('catalog.parts.json');
const issueCatalog = await decodeParts('issue-1-books.parts.json');
const readableCatalog = expandCompactCatalog(compactCatalog);

await Promise.all([
  fs.writeFile(
    path.join(dataDir, 'catalog.json'),
    `${JSON.stringify(readableCatalog, null, 2)}\n`,
    'utf8',
  ),
  fs.writeFile(
    path.join(dataDir, 'issue-1-books.json'),
    `${JSON.stringify(issueCatalog, null, 2)}\n`,
    'utf8',
  ),
]);

console.log(JSON.stringify({
  catalog_works: readableCatalog.works.length,
  catalog_editions: readableCatalog.editions.length,
  catalog_holdings: readableCatalog.holdings.length,
  issue_records: Array.isArray(issueCatalog.records) ? issueCatalog.records.length : null,
}));
