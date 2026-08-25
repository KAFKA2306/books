import { loadCatalog } from './load-catalog.mjs';
import { workIdentityKey } from '../src/work-identity.mjs';

const catalog = await loadCatalog();
const byKey = new Map();
for (const work of catalog.works) {
  const key = workIdentityKey(work);
  const list = byKey.get(key) ?? [];
  list.push(work);
  byKey.set(key, list);
}

const collisions = [...byKey.entries()]
  .filter(([, works]) => works.length > 1)
  .sort(([a], [b]) => a.localeCompare(b, 'ja'));

if (collisions.length) {
  for (const [key, works] of collisions) {
    console.error(`duplicate work identity key: ${JSON.stringify(key)}`);
    for (const work of works) console.error(`  ${work.work_id}\t${work.title}\t${work.work_type ?? 'unspecified'}`);
  }
  process.exit(1);
}

console.log(`no work identity collisions across ${catalog.works.length} works`);
