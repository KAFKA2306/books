import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('../src/app.parts.json', import.meta.url), 'utf8'));
const appBootstrap = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const detailUrlSource = await readFile(new URL('../src/app-detail-url.txt', import.meta.url), 'utf8');

test('Work詳細URLは既存のUIモジュールに追加される', () => {
  assert.deepEqual(manifest.parts, ['app-main.txt', 'app-detail-url.txt']);
});

test('Work詳細URLは検索条件と共存し、存在しないWorkを黙って無視しない', () => {
  assert.match(appBootstrap, /WORK_DETAIL_PARAM = 'work'/u);
  assert.match(appBootstrap, /preservedParams\.set\(WORK_DETAIL_PARAM/u);
  assert.match(detailUrlSource, /url\.searchParams\.set\('work', activeWorkId\)/u);
  assert.match(detailUrlSource, /state\.catalog\.works\.find/u);
  assert.match(detailUrlSource, /現在の正準データに存在しません/u);
  assert.match(detailUrlSource, /detailDialog\.addEventListener\('close'/u);
  assert.match(detailUrlSource, /activeWorkId = null/u);
});

test('分割されたUIソースを結合してもJavaScript構文が成立する', async () => {
  const sources = [];
  for (const part of manifest.parts) {
    sources.push(await readFile(new URL(`../src/${part}`, import.meta.url), 'utf8'));
  }

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'books-app-'));
  const temporaryModule = path.join(temporaryDirectory, 'app-assembled.mjs');
  try {
    await writeFile(temporaryModule, sources.join('\n'), 'utf8');
    execFileSync(process.execPath, ['--check', temporaryModule], { stdio: 'pipe' });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
