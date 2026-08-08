import { loadJoinedModule } from './src/module-loader.mjs';
import { normalizeSourceGroup } from './src/source-groups.mjs';

function normalizeLegacySourceUrl() {
  const url = new URL(window.location.href);
  const sources = url.searchParams.getAll('source');
  if (!sources.length) return;

  const normalized = [...new Set(sources.map((source) => normalizeSourceGroup(source)))];
  const unchanged = normalized.length === sources.length
    && normalized.every((value, index) => value === sources[index]);
  if (unchanged) return;

  url.searchParams.delete('source');
  normalized.forEach((source) => url.searchParams.append('source', source));
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function renderStartupError(error) {
  const grid = document.querySelector('#bookGrid');
  if (!grid) return;
  const panel = document.createElement('div');
  panel.className = 'empty-state';
  const title = document.createElement('strong');
  title.textContent = '本棚データを読み込めませんでした';
  const detail = document.createElement('p');
  detail.textContent = error instanceof Error ? error.message : String(error);
  panel.append(title, detail);
  grid.replaceChildren(panel);
  const count = document.querySelector('#resultCount');
  if (count) count.textContent = '0';
}

try {
  normalizeLegacySourceUrl();
  await loadJoinedModule({
    manifestUrl: new URL('./src/app.parts.json', import.meta.url),
    appModuleUrl: import.meta.url,
  });
} catch (error) {
  console.error(error);
  renderStartupError(error);
}
