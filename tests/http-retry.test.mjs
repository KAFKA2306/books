import test from 'node:test';
import assert from 'node:assert/strict';
import { retryAfterMilliseconds } from '../src/http-retry.mjs';

test('Retry-After delay-seconds is converted to milliseconds', () => {
  assert.equal(retryAfterMilliseconds('120'), 120_000);
});

test('Retry-After HTTP-date is measured from the supplied time', () => {
  assert.equal(
    retryAfterMilliseconds('Fri, 31 Dec 1999 23:59:59 GMT', Date.parse('Fri, 31 Dec 1999 23:57:59 GMT')),
    120_000,
  );
});

test('missing, invalid, or past Retry-After values are safe', () => {
  assert.equal(retryAfterMilliseconds(null), null);
  assert.equal(retryAfterMilliseconds('not-a-date'), null);
  assert.equal(retryAfterMilliseconds('Fri, 31 Dec 1999 23:57:59 GMT', Date.parse('Fri, 31 Dec 1999 23:59:59 GMT')), 0);
});
