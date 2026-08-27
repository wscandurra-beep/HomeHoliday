import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAlertMessage } from './alert-parsers.mjs';

const receivedAt = '2026-08-27T10:20:10.000Z';

test('parses Casa.it property links and strips tracking parameters', async () => {
  const html = `
    <a href="https://www.casa.it/immobili/54599477/?utm_source=alert">Appartamento in vendita in Via Melezet 125, Bardonecchia</a>
    <div>€ 225.000 90 m² 3 locali</div>`;
  const result = await parseAlertMessage({ from: 'noreply@casa.it', internalDate: receivedAt, html }, { location: 'Bardonecchia', maxPrice: 260000 });
  assert.equal(result.listings.length, 1);
  assert.deepEqual(result.listings[0], {
    id: 'casa-54599477', externalId: '54599477',
    title: 'Appartamento in vendita in Via Melezet 125, Bardonecchia',
    location: 'Bardonecchia', source: 'Casa.it', sourceUrl: 'https://www.casa.it/immobili/54599477/',
    price: 225000, sqm: 90, rooms: 3, receivedAt, firstSeenAt: receivedAt, lastSeenAt: receivedAt,
    status: 'NEW', priceHistory: [{ price: 225000, capturedAt: receivedAt }]
  });
});

test('parses multiple Idealista listings and excludes prices above the configured maximum', async () => {
  const html = `
    <a href="https://www.idealista.it/immobile/34014883/?utm_source=alert">Bilocale in Via la Rho, 35, Bardonecchia</a>
    <div>280.000 € 2 loc. 57,00 m²</div>
    <a href="https://www.idealista.it/immobile/35601648/?utm_source=alert">Quadrilocale in Via la Rho, 58, Bardonecchia</a>
    <div>Da 109.125 € 4 loc. 90,00 m²</div>`;
  const result = await parseAlertMessage({ from: 'nonrispondere@idealista.it', internalDate: receivedAt, html }, { location: 'Bardonecchia', maxPrice: 260000 });
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].externalId, '35601648');
  assert.equal(result.listings[0].price, 109125);
  assert.equal(result.listings[0].sqm, 90);
  assert.equal(result.listings[0].rooms, 4);
});

test('resolves Immobiliare tracking URLs only to a verified numeric canonical URL', async () => {
  const tracking = 'https://clicks.immobiliare.it/f/a/safe-token';
  const html = `<a href="${tracking}">Monolocale viale San Francesco 3, Centro, Bardonecchia</a><div>€ 167.000 40 m² | 1 locale</div>`;
  const fetchImpl = async () => ({ ok: true, url: 'https://www.immobiliare.it/annunci/131901276/?utm_source=email', text: async () => '' });
  const result = await parseAlertMessage({ from: 'noreply@notifiche.immobiliare.it', internalDate: receivedAt, html }, { location: 'Bardonecchia', maxPrice: 260000, fetchImpl });
  assert.equal(result.unresolved.length, 0);
  assert.equal(result.listings[0].externalId, '131901276');
  assert.equal(result.listings[0].sourceUrl, 'https://www.immobiliare.it/annunci/131901276/');
});

test('does not invent an Immobiliare listing ID when the tracking URL cannot be verified', async () => {
  const tracking = 'https://clicks.immobiliare.it/f/a/safe-token';
  const html = `<a href="${tracking}">Monolocale viale San Francesco 3, Centro, Bardonecchia</a><div>€ 167.000 40 m² | 1 locale</div>`;
  const fetchImpl = async () => ({ ok: true, url: 'https://www.immobiliare.it/vendita-case/bardonecchia/', text: async () => '<html>search results</html>' });
  const result = await parseAlertMessage({ from: 'noreply@notifiche.immobiliare.it', internalDate: receivedAt, html }, { location: 'Bardonecchia', maxPrice: 260000, fetchImpl });
  assert.equal(result.listings.length, 0);
  assert.equal(result.unresolved.length, 1);
});
