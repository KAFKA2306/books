import { loadJoinedModule } from './src/module-loader.mjs';

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
  await loadJoinedModule({
    manifestUrl: new URL('./src/app.parts.json', import.meta.url),
    appModuleUrl: import.meta.url,
  });
} catch (error) {
  console.error(error);
  renderStartupError(error);
}
