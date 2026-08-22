/*
HomeHoliday – Immobiliare.it session exporter
Run this JavaScript on an open Immobiliare.it Bardonecchia search page from Chrome/Edge DevTools Snippets.
It uses the current browser session and same-origin requests only.
*/
(async () => {
  const MAX_PRICE = 260000;
  const MAX_PAGES = 50;
  const SLEEP_MS = 900;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const moneyToNumber = (value = '') => {
    const m = value.replace(/\s+/g, ' ').match(/(?:€|EUR)\s*([\d.]+(?:,\d{1,2})?)/i);
    return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null;
  };
  const clean = (value = '') => value.replace(/\s+/g, ' ').trim();

  function extractFromDocument(doc, pageUrl) {
    const results = [];
    const links = [...doc.querySelectorAll('a[href*="/annunci/"]')];
    const seen = new Set();

    for (const link of links) {
      const href = new URL(link.getAttribute('href'), pageUrl).href;
      const idMatch = href.match(/\/annunci\/(\d+)/);
      if (!idMatch) continue;
      const externalId = idMatch[1];
      if (seen.has(externalId)) continue;

      const card = link.closest('li, article, [class*="in-listingCard"], [class*="listing"], [class*="card"]') || link.parentElement;
      const text = clean(card?.textContent || link.textContent || '');
      const price = moneyToNumber(text);
      if (!price || price > MAX_PRICE) continue;

      const titleNode = card?.querySelector('a[href*="/annunci/"] [class*="title"], [class*="title"], h2, h3');
      const title = clean(titleNode?.textContent || link.textContent || `Immobile Immobiliare.it ${externalId}`);
      const sqmMatch = text.match(/(\d{1,4})\s*m(?:²|2)/i);
      const roomsMatch = text.match(/(\d+)\s*(?:locali|vani)/i);
      const agencyNode = card?.querySelector('[class*="agency"], [class*="brand"], img[alt]');
      const agencyName = clean(agencyNode?.getAttribute?.('alt') || agencyNode?.textContent || '');

      seen.add(externalId);
      results.push({
        id: `immobiliare-${externalId}`,
        externalId,
        title,
        location: 'Bardonecchia',
        price,
        sellerType: /privato/i.test(text) ? 'Privato' : 'Agenzia',
        agencyName: agencyName || undefined,
        source: 'Immobiliare.it',
        sourceUrl: href.split('?')[0],
        sqm: sqmMatch ? Number(sqmMatch[1]) : undefined,
        rooms: roomsMatch ? Number(roomsMatch[1]) : undefined,
        status: 'ACTIVE'
      });
    }
    return results;
  }

  const base = new URL(location.href);
  base.searchParams.delete('pag');
  base.searchParams.set('prezzoMassimo', String(MAX_PRICE));
  base.searchParams.set('criterio', 'rilevanza');

  const all = new Map();
  let consecutiveEmpty = 0;
  const pages = [];

  console.log(`HomeHoliday: avvio estrazione da ${base.href}`);

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(base);
    if (page > 1) url.searchParams.set('pag', String(page));
    else url.searchParams.delete('pag');

    console.log(`HomeHoliday: pagina ${page}…`);
    const response = await fetch(url.href, { credentials: 'include', cache: 'no-store' });

    // Immobiliare.it returns 404 when requesting a page beyond the last valid page.
    // Once at least one page has been read, this means normal end of pagination.
    if (response.status === 404 && page > 1) {
      pages.push({ page, found: 0, added: 0, endOfResults: true });
      console.log(`HomeHoliday: pagina ${page} non esiste (404) → fine risultati.`);
      break;
    }
    if (!response.ok) throw new Error(`Pagina ${page}: HTTP ${response.status}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items = extractFromDocument(doc, url.href);
    const before = all.size;
    items.forEach((item) => all.set(item.externalId, item));
    const added = all.size - before;
    pages.push({ page, found: items.length, added });
    console.log(`HomeHoliday: pagina ${page}: ${items.length} letti, ${added} nuovi, totale ${all.size}.`);

    if (added === 0) consecutiveEmpty += 1;
    else consecutiveEmpty = 0;
    if (consecutiveEmpty >= 2) {
      console.log('HomeHoliday: due pagine senza nuovi annunci → fine risultati.');
      break;
    }
    await sleep(SLEEP_MS);
  }

  const capturedAt = new Date().toISOString();
  const listings = [...all.values()].map((item) => ({
    ...item,
    firstSeenAt: capturedAt,
    lastSeenAt: capturedAt,
    priceHistory: [{ price: item.price, capturedAt }]
  }));

  const payload = {
    provider: 'Immobiliare.it',
    search: 'Bardonecchia vendita ≤ €260.000',
    sourcePage: location.href,
    capturedAt,
    pages,
    count: listings.length,
    listings
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `homeholiday-immobiliare-${capturedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  console.log(`HomeHoliday: completato. ${listings.length} annunci da ${pages.filter(p => !p.endOfResults).length} pagine valide.`);
  alert(`HomeHoliday: ${listings.length} annunci esportati da ${pages.filter(p => !p.endOfResults).length} pagine valide.`);
})();
