import { loadCatalog } from './load-catalog.mjs';

const catalog = await loadCatalog();
const byKey = new Map();
for (const work of catalog.works) {
  const list = byKey.get(work.title_key) ?? [];
  list.push(work);
  byKey.set(work.title_key, list);
}

const collisions = [...byKey.entries()]
  .filter(([, works]) => works.length > 1)
  .sort(([a], [b]) => a.localeCompare(b, 'ja'));

if (collisions.length) {
  for (const [key, works] of collisions) {
    console.error(`duplicate title_key: ${key}`);
    for (const work of works) console.error(`  ${work.work_id}\t${work.title}`);
  }
  process.exit(1);
}

console.log(`no title_key collisions across ${catalog.works.length} works`);
