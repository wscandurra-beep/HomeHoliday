import assert from 'node:assert/strict';
import test from 'node:test';
import { addressFingerprint, annotateDuplicateGroups, likelySameProperty } from './deduplicate-listings.mjs';

const listing = (externalId, source, title, price, sqm, rooms = 2) => ({
  externalId, source, title, price, sqm, rooms, location: 'Bardonecchia'
});

test('normalizes abbreviated and extended street names', () => {
  assert.deepEqual(
    addressFingerprint('Bilocale in Via G. F. Medail 56, Bardonecchia', 'Bardonecchia'),
    { street: 'medail', civic: '56' }
  );
  assert.deepEqual(
    addressFingerprint('Bilocale via Giuseppe Francesco Medail 56, Centro, Bardonecchia', 'Bardonecchia'),
    { street: 'medail', civic: '56' }
  );
});

test('rejects similar listings at different addresses', () => {
  const casa56 = listing('53376120', 'Casa.it', 'Bilocale in Via G. F. Medail 56, Bardonecchia', 160000, 51);
  assert.equal(likelySameProperty(casa56, listing('122170328', 'Immobiliare.it', 'Bilocale via Giuseppe Francesco Medail 82, Centro, Bardonecchia', 159000)), false);
  assert.equal(likelySameProperty(casa56, listing('127405041', 'Immobiliare.it', 'Bilocale via Medail 98, Centro, Bardonecchia', 159000)), false);
  assert.equal(likelySameProperty(casa56, listing('124635837', 'Immobiliare.it', 'Terratetto unifamiliare frazione Rochemolles, Bardonecchia', 159000)), false);
  assert.equal(likelySameProperty(casa56, listing('131852518', 'Immobiliare.it', 'Bilocale frazione Melezet 102, Centro, Bardonecchia', 160000)), false);
});

test('groups only the true Medail 56 cross-portal match', () => {
  const items = [
    listing('53376120', 'Casa.it', 'Bilocale in Via G. F. Medail 56, Bardonecchia', 160000, 51),
    listing('122170328', 'Immobiliare.it', 'Bilocale via Giuseppe Francesco Medail 82, Centro, Bardonecchia', 159000),
    listing('127405041', 'Immobiliare.it', 'Bilocale via Medail 98, Centro, Bardonecchia', 159000),
    listing('125224015', 'Immobiliare.it', 'Bilocale Medail 56, Centro, Bardonecchia', 160000),
    listing('126627343', 'Immobiliare.it', 'Bilocale buono stato, primo piano, Centro, Bardonecchia', 158000, 47),
    listing('124635837', 'Immobiliare.it', 'Terratetto unifamiliare frazione Rochemolles, Bardonecchia', 159000),
    listing('131852518', 'Immobiliare.it', 'Bilocale frazione Melezet 102, Centro, Bardonecchia', 160000)
  ];

  const grouped = annotateDuplicateGroups(items);
  assert.ok(grouped[0].duplicateGroupId);
  assert.equal(grouped[3].duplicateGroupId, grouped[0].duplicateGroupId);
  [1, 2, 4, 5, 6].forEach((index) => assert.equal(grouped[index].duplicateGroupId, undefined));
});

test('does not put two listings from the same portal in one duplicate group', () => {
  const grouped = annotateDuplicateGroups([
    listing('casa', 'Casa.it', 'Bilocale via Medail 56, Bardonecchia', 160000, 51),
    listing('imm-1', 'Immobiliare.it', 'Bilocale via Medail 56, Bardonecchia', 160000, 51),
    listing('imm-2', 'Immobiliare.it', 'Bilocale via Medail 56, Bardonecchia', 160000, 51)
  ]);
  assert.equal(grouped.filter((item) => item.duplicateGroupId === grouped[0].duplicateGroupId).length, 2);
  assert.equal(grouped[2].duplicateGroupId, undefined);
});

test('pairs same-day NEW listings when one portal hides the address', () => {
  const common = { status: 'NEW', firstSeenAt: '2026-08-23T12:00:00.000Z' };
  const subito = { ...listing('658035891', 'Subito.it', 'Appartamento Bardonecchia [BD23VRG]', 225000, 90, 3), ...common };
  const immobiliare = { ...listing('122598732', 'Immobiliare.it', 'Trilocale via Melezet 125, Centro, Bardonecchia', 225000, 90, 3), ...common };
  assert.equal(likelySameProperty(subito, immobiliare), true);
  const grouped = annotateDuplicateGroups([subito, immobiliare]);
  assert.equal(grouped[0].duplicateGroupId, grouped[1].duplicateGroupId);
});

test('does not use attribute-only pairing for older or different-day listings', () => {
  const subito = { ...listing('subito', 'Subito.it', 'Appartamento Bardonecchia [BD23VRG]', 225000, 90, 3), status: 'ACTIVE', firstSeenAt: '2026-08-23T12:00:00.000Z' };
  const immobiliare = { ...listing('imm', 'Immobiliare.it', 'Trilocale via Melezet 125, Centro, Bardonecchia', 225000, 90, 3), status: 'ACTIVE', firstSeenAt: '2026-08-23T12:00:00.000Z' };
  assert.equal(likelySameProperty(subito, immobiliare), false);
  assert.equal(likelySameProperty({ ...subito, status: 'NEW' }, { ...immobiliare, status: 'NEW', firstSeenAt: '2026-08-24T08:00:00.000Z' }), false);
});
