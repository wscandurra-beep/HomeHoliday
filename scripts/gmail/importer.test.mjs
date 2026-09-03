import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeListings, updateStores } from './importer.mjs';

const oldListing = {
  id: 'casa-1', externalId: '1', source: 'Casa.it', title: 'Trilocale a Bardonecchia', location: 'Bardonecchia',
  sourceUrl: 'https://www.casa.it/immobili/1/', price: 200000, sqm: 70, rooms: 3, status: 'ACTIVE',
  firstSeenAt: '2026-08-20T10:00:00.000Z', lastSeenAt: '2026-08-21T10:00:00.000Z',
  priceHistory: [{ price: 200000, capturedAt: '2026-08-20T10:00:00.000Z' }]
};

test('merge preserves firstSeenAt, the richer stored title and appends priceHistory only for a real change', () => {
  const incoming = { ...oldListing, title: 'Appartamento in vendita', price: 190000, firstSeenAt: '2026-08-27T10:00:00.000Z', lastSeenAt: '2026-08-27T10:00:00.000Z', receivedAt: '2026-08-27T10:00:00.000Z' };
  const merged = mergeListings([oldListing], [incoming])[0];
  assert.equal(merged.title, oldListing.title);
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

test('same-run repeated listings remain eligible for NEW same-day cross-platform grouping', () => {
  const observedAt = '2026-09-01T12:00:00.000Z';
  const candidate = (externalId, source, title) => ({
    externalId,
    source,
    title,
    location: 'Bardonecchia',
    price: 84000,
    sqm: 25,
    rooms: 1,
    status: 'NEW',
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    receivedAt: observedAt,
    priceHistory: [{ price: 84000, capturedAt: observedAt }]
  });
  const casa = candidate('casa-new', 'Casa.it', 'Monolocale via Melezet, Bardonecchia');
  const idealista = candidate('idealista-new', 'Idealista', 'Appartamento a Bardonecchia');
  const repeatedCasa = { ...casa, lastSeenAt: '2026-09-02T10:00:00.000Z', receivedAt: '2026-09-02T10:00:00.000Z' };

  const result = updateStores(
    { listings: [], providerStatus: {} },
    [],
    [casa, idealista, repeatedCasa],
    repeatedCasa.receivedAt,
    { messages: 2, imported: 3, unresolved: 0, excluded: 0 }
  );

  const storedCasa = result.store.listings.find((item) => item.externalId === casa.externalId);
  const storedIdealista = result.store.listings.find((item) => item.externalId === idealista.externalId);
  assert.equal(storedCasa.status, 'ACTIVE');
  assert.equal(storedIdealista.status, 'NEW');
  assert.ok(storedCasa.duplicateGroupId);
  assert.equal(storedCasa.duplicateGroupId, storedIdealista.duplicateGroupId);
});
