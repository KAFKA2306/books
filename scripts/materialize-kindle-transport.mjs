import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import zlib from 'node:zlib';

const dataDir = path.join(process.cwd(), 'data', 'kindle');
const names = (await fs.readdir(dataDir))
  .filter((name) => /^transport\.part\d+\.b64$/.test(name))
  .sort();
if (!names.length) throw new Error('No Kindle transport parts found');

const encoded = (await Promise.all(names.map((name) => fs.readFile(path.join(dataDir, name), 'utf8'))))
  .join('')
  .replace(/\s/g, '');
const xml = zlib.gunzipSync(Buffer.from(encoded, 'base64'));
const tempPath = path.join(os.tmpdir(), 'KindleSyncMetadataCache.xml');
await fs.writeFile(tempPath, xml);

const result = spawnSync(process.execPath, ['scripts/import-kindle-xml.mjs', tempPath], {
  cwd: process.cwd(),
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);
