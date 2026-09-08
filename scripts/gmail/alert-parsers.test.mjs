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

test('parses Casa.it when title and location are separate email elements', async () => {
  const html = `
    <a href="https://www.casa.it/immobili/53424681/?utm_source=alert">Appartamento in vendita in Via Giuseppe Verdi 14,</a>
    <div>Centro, Bardonecchia (TO)</div>
    <div>€ 230.000 63 m² 3 locali</div>
    <a href="https://www.casa.it/immobili/53424681/?utm_source=alert">Vedi 21 foto e dettagli</a>`;
  const result = await parseAlertMessage({ from: 'noreply@casa.it', internalDate: receivedAt, html }, { location: 'Bardonecchia', maxPrice: 260000 });
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].externalId, '53424681');
  assert.equal(result.listings[0].title, 'Appartamento in vendita in Via Giuseppe Verdi 14,');
  assert.equal(result.listings[0].price, 230000);
  assert.equal(result.listings[0].sqm, 63);
  assert.equal(result.listings[0].rooms, 3);
});

test('parses singular Casa.it room labels', async () => {
  const html = `
    <a href="https://www.casa.it/immobili/53492628/">Appartamento in vendita in Viale Bramafam 30,</a>
    <div>Centro, Bardonecchia (TO)</div>
    <div>€ 160.000 31 m² 1 locale</div>`;
  const result = await parseAlertMessage({ from: 'noreply@casa.it', internalDate: receivedAt, html }, { location: 'Bardonecchia', maxPrice: 260000 });
  assert.equal(result.listings[0].rooms, 1);
});

test('keeps repeated Casa.it titles tied to their own listing block', async () => {
  const html = `
    <a href="https://www.casa.it/immobili/54053597/">Appartamento in vendita in Via Frejus,</a>
    <div>Centro, Bardonecchia (TO) € 255.000 58 m² 2 locali</div>
    <a href="https://www.casa.it/immobili/54047856/">Appartamento in vendita in Via Frejus,</a>
    <div>Centro, Bardonecchia (TO) € 590.000 102 m² 4 locali</div>`;
  const result = await parseAlertMessage({ from: 'noreply@casa.it', internalDate: receivedAt, html }, { location: 'Bardonecchia', maxPrice: 260000 });
  assert.equal(result.candidateCount, 2);
  assert.equal(result.excluded, 1);
  assert.deepEqual(result.listings.map((listing) => listing.externalId), ['54053597']);
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

test('uses the reduced price from a dedicated Idealista price-drop alert', async () => {
  const html = `
    <a href="https://www.idealista.it/immobile/35388407/">Trilocale in Viale Capuccio, 10, Bardonecchia</a>
    <div>210.000 € ↓10% 189.000 € 3.375 €/m² 3 locali 56 m²</div>`;
  const result = await parseAlertMessage({
    from: 'nonrispondere@idealista.it',
    subject: 'Diminuzione di prezzo per la tua ricerca',
    internalDate: receivedAt,
    html
  }, { location: 'Bardonecchia', maxPrice: 260000 });
  assert.equal(result.listings[0].price, 189000);
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
