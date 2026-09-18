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
  assert.deepEqual(
    addressFingerprint('Appartamento in Via Gen. Cantore 9, Bardonecchia', 'Bardonecchia'),
    { street: 'cantore', civic: '9' }
  );
  assert.deepEqual(
    addressFingerprint('Bilocale via Generale Antonio Cantore 9, Centro, Bardonecchia', 'Bardonecchia'),
    { street: 'cantore', civic: '9' }
  );
});

test('rejects similar listings at different addresses', () => {
  const casa56 = listing('53376120', 'Casa.it', 'Bilocale in Via G. F. Medail 56, Bardonecchia', 160000, 51);
  assert.equal(likelySameProperty(casa56, listing('different', 'Immobiliare.it', 'Bilocale via Campo Principe 56, Bardonecchia', 160000, 51)), false);
  assert.equal(likelySameProperty(casa56, listing('124635837', 'Immobiliare.it', 'Terratetto unifamiliare frazione Rochemolles, Bardonecchia', 159000)), false);
  assert.equal(likelySameProperty(casa56, listing('131852518', 'Immobiliare.it', 'Bilocale frazione Melezet 102, Centro, Bardonecchia', 160000)), false);
});

test('groups strong Medail matches and excludes a different street', () => {
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
  [4, 5, 6].forEach((index) => assert.equal(grouped[index].duplicateGroupId, undefined));
});

test('groups matching listings from the same portal too', () => {
  const grouped = annotateDuplicateGroups([
    listing('one', 'Casa.it', 'Quadrilocale in Via la Rho 58, Bardonecchia', 109125, 90, 4),
    listing('two', 'Casa.it', 'Quadrilocale in Via la Rho, Bardonecchia', 109126, 90, 4)
  ]);
  assert.equal(grouped[0].duplicateGroupId, grouped[1].duplicateGroupId);
});

test('groups the three real Via la Rho variants into exactly one card', () => {
  const grouped = annotateDuplicateGroups([
    listing('idealista', 'Idealista', 'Trilocale in Via la Rho s.n.c, Bardonecchia', 109125, 90, 3),
    listing('casa', 'Casa.it', 'Quadrilocale in Via la Rho, 58, Bardonecchia', 109125, 90, 4),
    listing('immobiliare', 'Immobiliare.it', 'Quadrilocale in Via la Rho, Bardonecchia', 109126, 90, 4)
  ]);
  assert.equal(new Set(grouped.map(item => item.duplicateGroupId)).size, 1);
  assert.ok(grouped[0].duplicateGroupId);
});

test('pairs same-day NEW listings when one portal hides the address', () => {
  const common = { status: 'NEW', firstSeenAt: '2026-08-23T12:00:00.000Z' };
  const subito = { ...listing('658035891', 'Subito.it', 'Appartamento Bardonecchia [BD23VRG]', 225000, 90, 3), ...common };
  const immobiliare = { ...listing('122598732', 'Immobiliare.it', 'Trilocale via Melezet 125, Centro, Bardonecchia', 225000, 90, 3), ...common };
  assert.equal(likelySameProperty(subito, immobiliare), true);
  const grouped = annotateDuplicateGroups([subito, immobiliare]);
  assert.equal(grouped[0].duplicateGroupId, grouped[1].duplicateGroupId);
});

test('normalizes s.n.c. and pairs only same-day NEW listings without a civic number', () => {
  assert.deepEqual(
    addressFingerprint('Trilocale in Via la Rho s.n.c, Bardonecchia', 'Bardonecchia'),
    { street: 'la rho', civic: undefined }
  );
  assert.deepEqual(
    addressFingerprint('Appartamento in vendita in Via la Rho, Bardonecchia', 'Bardonecchia'),
    { street: 'la rho', civic: undefined }
  );

  const common = { status: 'NEW', firstSeenAt: '2026-09-16T10:00:00.000Z' };
  const idealista = { ...listing('36835410', 'Idealista', 'Trilocale in Via la Rho s.n.c, Bardonecchia', 109125, 90, 3), ...common };
  const casa = { ...listing('54745886', 'Casa.it', 'Appartamento in vendita in Via la Rho, Bardonecchia', 109125, 90, 3), ...common };

  assert.equal(likelySameProperty(idealista, casa), true);
  assert.equal(likelySameProperty({ ...idealista, status: 'ACTIVE' }, { ...casa, status: 'ACTIVE' }), true);

  const grouped = annotateDuplicateGroups([idealista, casa]);
  assert.ok(grouped[0].duplicateGroupId);
  assert.equal(grouped[0].duplicateGroupId, grouped[1].duplicateGroupId);
});

test('does not use attribute-only pairing for older or different-day listings', () => {
  const subito = { ...listing('subito', 'Subito.it', 'Appartamento Bardonecchia [BD23VRG]', 225000, 90, 3), status: 'ACTIVE', firstSeenAt: '2026-08-23T12:00:00.000Z' };
  const immobiliare = { ...listing('imm', 'Immobiliare.it', 'Trilocale via Melezet 125, Centro, Bardonecchia', 225000, 90, 3), status: 'ACTIVE', firstSeenAt: '2026-08-23T12:00:00.000Z' };
  assert.equal(likelySameProperty(subito, immobiliare), false);
  assert.equal(likelySameProperty({ ...subito, status: 'NEW' }, { ...immobiliare, status: 'NEW', firstSeenAt: '2026-08-24T08:00:00.000Z' }), false);
});

test('preserves a previously verified attribute-only group after listings become ACTIVE', () => {
  const previousGroup = 'verified-group';
  const casa = {
    ...listing('casa-active', 'Casa.it', 'Appartamento in Via Melezet, Bardonecchia', 84000, 25, 1),
    status: 'ACTIVE', firstSeenAt: '2026-09-01T10:00:00.000Z', duplicateGroupId: previousGroup
  };
  const immobiliare = {
    ...listing('imm-active', 'Immobiliare.it', 'Monolocale via Melezet, Centro, Bardonecchia', 84000, 25, 1),
    status: 'ACTIVE', firstSeenAt: '2026-09-01T10:10:00.000Z', duplicateGroupId: previousGroup
  };

  assert.equal(likelySameProperty(casa, immobiliare), true);
  const grouped = annotateDuplicateGroups([casa, immobiliare]);
  assert.ok(grouped[0].duplicateGroupId);
  assert.equal(grouped[0].duplicateGroupId, grouped[1].duplicateGroupId);
});
