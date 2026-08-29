import { loadJoinedModule } from './src/module-loader.mjs';
import { normalizeSourceGroup } from './src/source-groups.mjs';
import { createDisplayCatalog, includeLowPriceFromSearch } from './src/display-visibility.mjs';

const INCLUDE_LOW_PRICE_PARAM = 'include_low_price';
const WORK_DETAIL_PARAM = 'work';

function includeLowPriceEnabled() {
  return includeLowPriceFromSearch(window.location.search);
}

function installVisibilityHistoryGuard() {
  const initialUrl = new URL(window.location.href);
  const preservedParams = new Map();
  if (includeLowPriceEnabled()) preservedParams.set(INCLUDE_LOW_PRICE_PARAM, '1');
  if (initialUrl.searchParams.has(WORK_DETAIL_PARAM)) {
    preservedParams.set(WORK_DETAIL_PARAM, initialUrl.searchParams.get(WORK_DETAIL_PARAM));
  }
  if (preservedParams.size === 0) return;

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (state, unused, url) => {
    if (url == null) return originalReplaceState(state, unused, url);
    const next = new URL(String(url), window.location.href);
    for (const [key, value] of preservedParams) {
      if (value != null && !next.searchParams.has(key)) next.searchParams.set(key, value);
    }
    return originalReplaceState(state, unused, `${next.pathname}${next.search}${next.hash}`);
  };
}

function normalizeLegacySourceUrl() {
  const url = new URL(window.location.href);
  const sources = url.searchParams.getAll('source');
  const normalized = [...new Set(sources.map((source) => normalizeSourceGroup(source)))];

  if (url.searchParams.get('view') === 'list' && normalized.length === 0) {
    normalized.push('Kindle');
  }

  const unchanged = normalized.length === sources.length
    && normalized.every((value, index) => value === sources[index]);
  if (unchanged) return;

  url.searchParams.delete('source');
  normalized.forEach((source) => url.searchParams.append('source', source));
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function wireLowPriceToggle() {
  const toggle = document.querySelector('#includeLowPriceToggle');
  if (!toggle) return;
  toggle.checked = includeLowPriceEnabled();
  toggle.addEventListener('change', () => {
    const url = new URL(window.location.href);
    if (toggle.checked) url.searchParams.set(INCLUDE_LOW_PRICE_PARAM, '1');
    else url.searchParams.delete(INCLUDE_LOW_PRICE_PARAM);
    url.searchParams.delete('page');
    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  });
}

function installCatalogDisplayBoundary() {
  const canonicalCatalogUrl = new URL('./api/v1/catalog.json', import.meta.url);
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const requestUrl = input instanceof Request
      ? new URL(input.url, window.location.href)
      : new URL(String(input), window.location.href);
    const response = await originalFetch(input, init);
    if (!response.ok || requestUrl.href !== canonicalCatalogUrl.href) return response;

    const catalog = await response.clone().json();
    const displayCatalog = createDisplayCatalog(catalog, { includeLowPrice: includeLowPriceEnabled() });
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json; charset=utf-8');
    headers.delete('content-length');
    headers.delete('content-encoding');

    return new Response(JSON.stringify(displayCatalog), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
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
  installVisibilityHistoryGuard();
  normalizeLegacySourceUrl();
  wireLowPriceToggle();
  installCatalogDisplayBoundary();
  await loadJoinedModule({
    manifestUrl: new URL('./src/app.parts.json', import.meta.url),
    appModuleUrl: import.meta.url,
  });
} catch (error) {
  console.error(error);
  renderStartupError(error);
}
