import { test, expect } from '@playwright/test';

const baseURL = new URL(process.env.PAGES_BASE_URL ?? 'http://127.0.0.1:4173/');

test.use({ baseURL: baseURL.href });

function sameOriginFailureCollector(page) {
  const failures = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === baseURL.origin && response.status() >= 400) {
      failures.push(`${response.status()} ${url.pathname}`);
    }
  });
  return failures;
}

async function waitForCatalog(page) {
  await expect(page.locator('#bookGrid')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.book-card').first()).toBeVisible();
}

test('keyboard journey exposes focus and Work / Edition / Holding / Acquisition', async ({ page }) => {
  const failures = sameOriginFailureCollector(page);
  await page.goto('./', { waitUntil: 'networkidle' });
  await waitForCatalog(page);

  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  const skipVisible = await page.locator('.skip-link').evaluate((element) => {
    const style = getComputedStyle(element);
    return style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)';
  });
  expect(skipVisible).toBe(true);

  const workId = await page.evaluate(async () => {
    const response = await fetch('./api/v1/catalog.json', { cache: 'no-store' });
    const catalog = await response.json();
    const editionWorkIds = new Set(catalog.editions.map((entry) => entry.work_id));
    const holdingWorkIds = new Set(catalog.holdings.map((entry) => entry.work_id));
    const acquisitionWorkIds = new Set((catalog.acquisitions ?? []).map((entry) => entry.work_id));
    return catalog.works.find((work) => editionWorkIds.has(work.work_id)
      && holdingWorkIds.has(work.work_id)
      && acquisitionWorkIds.has(work.work_id))?.work_id ?? null;
  });
  expect(workId).toBeTruthy();

  const detailUrl = new URL(baseURL.href);
  detailUrl.searchParams.set('work', workId);
  await page.goto(detailUrl.href, { waitUntil: 'networkidle' });
  await expect(page.locator('#detailDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#detailContent')).toContainText('Edition');
  await expect(page.locator('#detailContent')).toContainText('Holding');
  await expect(page.locator('#detailContent')).toContainText('Acquisition');
  await expect(page.locator('#detailClose')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('#detailDialog')).not.toHaveAttribute('open', '');
  await expect.poll(() => new URL(page.url()).searchParams.has('work')).toBe(false);
  expect(failures).toEqual([]);
});

test('empty and data-error states are distinguishable', async ({ page }) => {
  await page.goto('./', { waitUntil: 'networkidle' });
  await waitForCatalog(page);

  await page.locator('#searchInput').fill('__no_such_book_74__');
  await expect(page.locator('#emptyState')).toBeVisible();
  await expect(page.locator('#resultCount')).toHaveText('0');
  await expect(page.locator('#emptyState')).toContainText('該当する作品がありません');

  await page.route('**/api/v1/catalog.json', (route) => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.goto('./');
  await expect(page.locator('#bookGrid')).toContainText('データを読み込めませんでした');
  await expect(page.locator('#bookGrid')).toContainText('503');
});

test('mobile filtering works without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./', { waitUntil: 'networkidle' });
  await waitForCatalog(page);

  await expect(page.locator('#filterPanel')).not.toBeVisible();
  await page.locator('#filterToggle').click();
  await expect(page.locator('#filterToggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#filterPanel')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('1280px viewport remains usable at 200% zoom equivalent', async ({ page }) => {
  // 1280px at 200% browser zoom exposes roughly a 640 CSS-pixel layout viewport.
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto('./', { waitUntil: 'networkidle' });
  await waitForCatalog(page);

  await expect(page.locator('#filterToggle')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('.book-card').first()).toBeVisible();
});
