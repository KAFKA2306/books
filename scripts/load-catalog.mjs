import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

export async function loadCatalog(root = process.cwd()) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'data/catalog.parts.json'), 'utf8'));
  const chunks = await Promise.all(manifest.parts.map((part) => fs.readFile(path.join(root, 'data', part), 'utf8')));
  const compressed = Buffer.from(chunks.join('').replace(/\s/g, ''), 'base64');
  const compact = JSON.parse(zlib.gunzipSync(compressed).toString('utf8'));
  const works = compact.w.map(([work_id,title,title_key,category,status,progress,rating,price_yen,acquired_at,item_count,sources,formats]) => ({
    work_id,title,title_key,author:null,category,status,progress,rating,price_yen,acquired_at,item_count,isbn_count:0,isbn_status:'missing',sources,formats,
  }));
  const editions = works.map((work) => ({ edition_id:`pending:${work.work_id.slice(4)}`,id_kind:'pending_title_key',work_id:work.work_id,isbn13:null,isbn10:null,language:null,publisher:null,published_year:null,format:null,verification:'unverified' }));
  const holdings = works.flatMap((work) => work.sources.map((source, index) => ({ holding_id:`${work.work_id}:h${index+1}`,work_id:work.work_id,edition_id:`pending:${work.work_id.slice(4)}`,source,format:work.formats[index] ?? work.formats[0] ?? '不明',quantity:index===0?work.item_count:1,acquired_at:work.acquired_at,price_yen:index===0?work.price_yen:null,progress:index===0?work.progress:null,rating:index===0?work.rating:null })));
  return { schema_version:compact.v, generated_at:compact.g, key_policy:{work:'deterministic normalized title hash',edition:'verified ISBN-13 preferred'}, stats:{...compact.s,edition_count:editions.length,holding_count:holdings.length}, works,editions,holdings };
}
