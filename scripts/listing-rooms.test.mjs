import test from 'node:test';
import assert from 'node:assert/strict';
import { listingRooms, matchesRooms, parseRooms } from '../src/listingRooms.mjs';

test('extracts total rooms from listing text and property names', () => {
  for (const [text, count] of [
    ['Appartamento 3 LOCALI', 3], ['1 locale', 1], ['2 loc.', 2],
    ['Locali: 4', 4], ['5 vani', 5], ['BILOCALE con terrazzo', 2],
    ['Monolocale', 1], ['Trilocale', 3], ['Quadrilocale', 4], ['Pentalocale', 5],
  ]) assert.equal(parseRooms(text), count, text);
  assert.equal(parseRooms('Casa con 2 camere e 1 bagno, 75 m²'), undefined);
  assert.equal(parseRooms('Locale commerciale'), undefined);
  assert.equal(parseRooms('0 locali'), undefined);
});

test('keeps explicit source data and only fills missing or invalid counts', () => {
  assert.equal(listingRooms({ title: 'Trilocale', rooms: 4 }), 4);
  assert.equal(listingRooms({ title: 'Trilocale' }), 3);
  assert.equal(listingRooms({ title: 'Trilocale', rooms: 0 }), 3);
  assert.equal(listingRooms({ title: 'Appartamento' }), undefined);
});

test('room categories handle exact counts, 5+, and unknown data', () => {
  assert.equal(matchesRooms(undefined, ''), true);
  assert.equal(matchesRooms(undefined, 'unknown'), true);
  assert.equal(matchesRooms(undefined, '2'), false);
  assert.equal(matchesRooms(2, '2'), true);
  assert.equal(matchesRooms(3, '2'), false);
  assert.equal(matchesRooms(5, '5+'), true);
  assert.equal(matchesRooms(7, '5+'), true);
  assert.equal(matchesRooms(4, '5+'), false);
  assert.equal(matchesRooms(2, 'unknown'), false);
});
