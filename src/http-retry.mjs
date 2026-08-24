export function retryAfterMilliseconds(value, now = Date.now()) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text) * 1_000;

  const retryAt = Date.parse(text);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(0, retryAt - now);
}
