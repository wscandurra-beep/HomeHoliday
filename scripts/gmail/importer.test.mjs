import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeListings, updateStores } from './importer.mjs';

const oldListing = {
  id: 'casa-1', externalId: '1', source: 'Casa.it', title: 'Trilocale a Bardonecchia', location: 'Bardonecchia',
  sourceUrl: 'https://www.casa.it/immobili/1/', price: 200000, sqm: 70, rooms: 3, status: 'ACTIVE',
  firstSeenAt: '2026-08-20T10:00:00.000Z', lastSeenAt: '2026-08-21T10:00:00.000Z',
  priceHistory: [{ price: 200000, capturedAt: '2026-08-20T10:00:00.000Z' }]
};

test('merge preserves firstSeenAt and appends priceHistory only for a real change', () => {
  const incoming = { ...oldListing, price: 190000, firstSeenAt: '2026-08-27T10:00:00.000Z', lastSeenAt: '2026-08-27T10:00:00.000Z', receivedAt: '2026-08-27T10:00:00.000Z' };
  const merged = mergeListings([oldListing], [incoming])[0];
  assert.equal(merged.firstSeenAt, oldListing.firstSeenAt);
  assert.equal(merged.lastSeenAt, incoming.lastSeenAt);
  assert.equal(merged.status, 'UPDATED');
  assert.deepEqual(merged.priceHistory, [
    oldListing.priceHistory[0],
    { price: 190000, capturedAt: incoming.receivedAt }
  ]);
});

test('store update preserves unrelated provider status and annotates the Gmail run', () => {
  const result = updateStores(
    { listings: [oldListing], refreshedAt: oldListing.lastSeenAt, providerStatus: { subito: { ok: true } } },
    [], [oldListing], '2026-08-27T10:00:00.000Z', { messages: 1, imported: 1, unresolved: 0, excluded: 0 }
  );
  assert.equal(result.store.providerStatus.subito.ok, true);
  assert.equal(result.store.providerStatus.emailAlerts.count, 1);
  assert.equal(result.archiveListings.length, 1);
});
