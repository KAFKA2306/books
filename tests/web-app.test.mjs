import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { absolutizeAppImports } from '../src/module-loader.mjs';

const root = new URL('../', import.meta.url);

async function readJoinedAppSource() {
  const manifest = JSON.parse(await fs.readFile(new URL('src/app.parts.json', root), 'utf8'));
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const parts = [];
  for (const part of manifest.parts) {
    const bytes = await fs.readFile(new URL(`src/${part}`, root));
    parts.push(decoder.decode(bytes));
  }
  return parts.join('');
}

test('blob module imports are rewritten to the deployed app origin', () => {
  const source = "import { x } from './src/catalog.mjs'; const y = import('./src/merge-catalog.mjs');";
  const rewritten = absolutizeAppImports(source, 'https://example.test/books/app.js');
  assert.match(rewritten, /https:\/\/example\.test\/books\/src\/catalog\.mjs/);
  assert.match(rewritten, /https:\/\/example\.test\/books\/src\/merge-catalog\.mjs/);
  assert.doesNotMatch(rewritten, /['"]\.\/src\//);
});

test('browser application reads the canonical API instead of legacy compressed catalog', async () => {
  const source = await readJoinedAppSource();
  assert.match(source, /\.\/api\/v1\/catalog\.json/);
  assert.match(source, /cache:\s*['"]no-store['"]/);
  assert.doesNotMatch(source, /catalog\.parts\.json/);
  assert.doesNotMatch(source, /issue-1-books\.parts\.json/);
  assert.doesNotMatch(source, /DecompressionStream/);
});

test('large-catalog UX keeps removable filters, mobile filter toggle, and Work detail entities', async () => {
  const source = await readJoinedAppSource();
  assert.match(source, /filterToggle/);
  assert.match(source, /renderPagination/);
  assert.match(source, /Edition/);
  assert.match(source, /Holding/);
  assert.match(source, /Acquisition/);
  const html = await fs.readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /id="filterToggle"/);
  assert.match(html, /ui\.css/);
});

test('joined browser application is valid UTF-8 and valid module syntax', async () => {
  const source = await readJoinedAppSource();
  assert.doesNotMatch(source, /\uFFFD/u);
  assert.doesNotMatch(source, /(?:Ã|Â·|â€”|ãƒ|æœ|ç™|éŒ)/u);

  const rewritten = absolutizeAppImports(source, 'https://example.test/books/app.js');
  assert.doesNotMatch(rewritten, /(?:from\s+|import\()['"]\.\/src\//u);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'books-web-app-'));
  const modulePath = path.join(tempDir, 'app.mjs');
  await fs.writeFile(modulePath, rewritten);
  const checked = spawnSync(process.execPath, ['--check', modulePath], { encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
});
