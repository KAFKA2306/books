export const DEFAULT_LOW_PRICE_MAX_YEN = 55;

export function isDefaultHiddenLowPriceWork(work) {
  const price = work?.price_yen;
  return typeof price === 'number'
    && Number.isFinite(price)
    && price <= DEFAULT_LOW_PRICE_MAX_YEN;
}

export function filterWorksForDisplay(works, { includeLowPrice = false } = {}) {
  if (!Array.isArray(works)) throw new TypeError('works must be an array');
  return includeLowPrice ? [...works] : works.filter((work) => !isDefaultHiddenLowPriceWork(work));
}

export function createDisplayCatalog(catalog, { includeLowPrice = false } = {}) {
  if (!catalog || !Array.isArray(catalog.works)) throw new TypeError('catalog.works must be an array');
  return {
    ...catalog,
    works: filterWorksForDisplay(catalog.works, { includeLowPrice }),
  };
}

export function includeLowPriceFromSearch(search = '') {
  const params = new URLSearchParams(search);
  return params.get('include_low_price') === '1';
}
