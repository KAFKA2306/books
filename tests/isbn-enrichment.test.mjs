import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyIsbnEnrichments,
  consolidateCandidates,
  eligibleWorks,
  parseGoogleBooks,
  parseNdlOpenSearch,
  parseOpenBd,
  retryAfter,
} from '../src/isbn-enrichment.mjs';

test('provider parsers normalize ISBN-10 and ISBN-13', () => {
  const ndl = parseNdlOpenSearch(`<?xml version="1.0"?><rss><channel><item><title>赤毛のアン</title><dc:creator>L.M.モンゴメリ</dc:creator><dc:publisher>新潮社</dc:publisher><dc:date>2008</dc:date><dc:identifier xsi:type="dcndl:ISBN">9784102113417</dc:identifier><link>https://ndl.example/book</link></item></channel></rss>`);
  assert.equal(ndl[0].isbn13, '9784102113417');

  const google = parseGoogleBooks({
    items: [{
      selfLink: 'https://google.example/volume',
      volumeInfo: {
        title: '赤毛のアン',
        authors: ['L.M.モンゴメリ'],
        industryIdentifiers: [{ type: 'ISBN_10', identifier: '410211341X' }],
      },
    }],
  });
  assert.equal(google[0].isbn13, '9784102113417');

  const openbd = parseOpenBd([{
    summary: {
      isbn: '9784102113417',
      title: '赤毛のアン',
      author: 'L.M.モンゴメリ',
      publisher: '新潮社',
      pubdate: '2008',
    },
  }]);
  assert.equal(openbd[0].provider, 'openbd');
});

test('only one ISBN supported by multiple providers is accepted', () => {
  const work = { work_id: 'wrk_1', title: '赤毛のアン' };
  const result = consolidateCandidates(work, [
    { provider: 'google_books', isbn13: '9784102113417', title: '赤毛のアン', authors: [] },
    { provider: 'openbd', isbn13: '9784102113417', title: '赤毛のアン', authors: [] },
    { provider: 'ndl', isbn13: '9784877232993', title: '赤毛のアン', authors: [] },
  ]);
  assert.equal(result.outcome, 'accepted');
  assert.equal(result.accepted.isbn13, '9784102113417');
});

test('multiple consensus ISBNs are blocked as ambiguous', () => {
  const work = { work_id: 'wrk_1', title: '赤毛のアン' };
  const result = consolidateCandidates(work, [
    { provider: 'google_books', isbn13: '9784102113417', title: '赤毛のアン' },
    { provider: 'openbd', isbn13: '9784102113417', title: '赤毛のアン' },
    { provider: 'google_books', isbn13: '9784877232993', title: '赤毛のアン' },
    { provider: 'ndl', isbn13: '9784877232993', title: '赤毛のアン' },
  ]);
  assert.equal(result.outcome, 'ambiguous');
});

test('eligibility excludes verified and electronic editions', () => {
  const catalog = {
    works: [
      { work_id: 'a', title: 'A' },
      { work_id: 'b', title: 'B' },
      { work_id: 'c', title: 'C' },
    ],
    editions: [
      { edition_id: 'pending:a', work_id: 'a', isbn13: null, verification: 'unverified' },
      { edition_id: 'isbn13:9784102113417', work_id: 'b', isbn13: '9784102113417', verification: 'verified' },
      { edition_id: 'pending:c', work_id: 'c', isbn13: null, verification: 'unverified' },
    ],
    holdings: [
      { edition_id: 'pending:a', format: '紙' },
      { edition_id: 'pending:c', format: 'Kindle' },
    ],
  };
  const eligible = eligibleWorks(
    catalog,
    { attempts: {} },
    new Date('2026-08-07T00:00:00Z'),
  );
  assert.deepEqual(eligible.map((entry) => entry.work.work_id), ['a']);
});

test('overlay replaces one pending edition and holding references', () => {
  const catalog = {
    stats: { edition_count: 1, holding_count: 1, isbn_verified_count: 0 },
    works: [{
      work_id: 'a',
      title: '赤毛のアン',
      author: null,
      isbn_count: 0,
      isbn_status: 'missing',
    }],
    editions: [{
      edition_id: 'pending:a',
      id_kind: 'pending_title_key',
      work_id: 'a',
      isbn13: null,
      verification: 'unverified',
    }],
    holdings: [{ holding_id: 'h1', work_id: 'a', edition_id: 'pending:a' }],
  };
  const result = applyIsbnEnrichments(catalog, {
    records: [{
      work_id: 'a',
      replaces_edition_id: 'pending:a',
      isbn13: '9784102113417',
      title: '赤毛のアン',
      authors: ['L.M.モンゴメリ'],
      sources: [
        { provider: 'ndl', url: 'https://ndl.example/book' },
        { provider: 'openbd', url: 'https://openbd.example/book' },
      ],
      verified_at: '2026-08-07T00:00:00Z',
    }],
  });
  assert.equal(result.editions[0].edition_id, 'isbn13:9784102113417');
  assert.equal(result.holdings[0].edition_id, 'isbn13:9784102113417');
  assert.equal(result.works[0].isbn_status, 'verified');
  assert.equal(result.stats.isbn_verified_count, 1);
});

test('retry windows are deterministic', () => {
  assert.equal(
    retryAfter('provider_error', new Date('2026-08-07T00:00:00Z')),
    '2026-08-08T00:00:00.000Z',
  );
});
