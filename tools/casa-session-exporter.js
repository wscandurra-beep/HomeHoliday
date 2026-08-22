/*
HomeHoliday – Casa.it session exporter
Run this JavaScript from Chrome/Edge DevTools > Sources > Snippets while the Casa.it search page is open.
It uses the current browser session and same-origin requests only.
*/
(async () => {
  const MAX_PRICE = 260000;
  const MAX_PAGES = 50;
  const SLEEP_MS = 900;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value = '') => value.replace(/\s+/g, ' ').trim();

  function moneyToNumber(value = '') {
    const normalized = value.replace(/\u00a0/g, ' ');
    const matches = [
      ...normalized.matchAll(/(?:Asta\s+da\s+)?€\s*([\d.]+(?:,\d{1,2})?)/gi),
      ...normalized.matchAll(/([\d.]+(?:,\d{1,2})?)\s*€/gi)
    ];
    for (const match of matches) {
      const number = Number(match[1].replace(/\./g, '').replace(',', '.'));
      if (number > 0 && number <= MAX_PRICE) return number;
    }
    return null;
  }

  function extractId(href = '') {
    return href.match(/\/immobili\/(\d+)\/?/i)?.[1] || null;
  }

  function extractFromDocument(doc, pageUrl) {
    const results = [];
    const seen = new Set();
    const links = [...doc.querySelectorAll('a[href*="/immobili/"]')];

    for (const link of links) {
      const href = new URL(link.getAttribute('href'), pageUrl).href.split('?')[0];
      const externalId = extractId(href);
      if (!externalId || seen.has(externalId)) continue;

      const card = link.closest('article, li, [class*="property"], [class*="listing"], [class*="card"], [data-testid]') || link.parentElement?.parentElement || link.parentElement;
      const text = clean(card?.textContent || link.textContent || '');
      const price = moneyToNumber(text);
      if (!price || price > MAX_PRICE) continue;

      const heading = card?.querySelector('h1,h2,h3,h4,[class*="title"],[data-testid*="title"]');
      let title = clean(heading?.textContent || link.textContent || '');
      if (!title || title.length < 5) {
        const fallback = text.match(/(?:Monolocale|Bilocale|Trilocale|Quadrilocale|Appartamento|Attico|Mansarda|Casa indipendente|Casa bifamiliare|Baita|Chalet)[^€]{0,180}/i)?.[0];
        title = clean(fallback || `Immobile Casa.it ${externalId}`);
      }

      const sqmMatch = text.match(/(\d{1,4})\s*(?:m²|mq|m2)\b/i);
      const roomsMatch = text.match(/(\d{1,2})\s*(?:locali|locale|vani|vano)\b/i);
      const sellerType = /Inserzionista\s+privato|\bPrivato\b/i.test(text) ? 'Privato' : 'Agenzia';

      let agencyName;
      if (sellerType === 'Agenzia') {
        const candidates = [...(card?.querySelectorAll('img[alt], [class*="agency"], [class*="brand"], [data-testid*="agency"]') || [])];
        for (const node of candidates) {
          const value = clean(node.getAttribute?.('alt') || node.textContent || '');
          if (value && !/^(facciata|salone|soggiorno|cucina|camera|vista|terrazzo|giardino|interno|esterno|altro)$/i.test(value)) {
            agencyName = value;
            break;
          }
        }
      }

      seen.add(externalId);
      results.push({
        id: `casa-${externalId}`,
        externalId,
        title,
        location: 'Bardonecchia',
        price,
        sellerType,
        agencyName: agencyName || undefined,
        source: 'Casa.it',
        sourceUrl: href,
        sqm: sqmMatch ? Number(sqmMatch[1]) : undefined,
        rooms: roomsMatch ? Number(roomsMatch[1]) : undefined,
        status: 'ACTIVE'
      });
    }
    return results;
  }

  const base = new URL(location.href);
  base.searchParams.set('tr', 'vendita');
  base.searchParams.set('priceMax', String(MAX_PRICE));
  base.searchParams.set('sortType', 'relevance');
  base.searchParams.set('propertyTypeGroup', 'case');
  base.searchParams.delete('page');

  const all = new Map();
  const pages = [];
  let consecutiveEmpty = 0;

  console.log(`HomeHoliday Casa.it: avvio estrazione da ${base.href}`);

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(base);
    if (page > 1) url.searchParams.set('page', String(page));
    else url.searchParams.delete('page');

    console.log(`HomeHoliday Casa.it: pagina ${page}…`);
    const response = await fetch(url.href, { credentials: 'include', cache: 'no-store' });

    if ((response.status === 404 || response.status === 410) && page > 1) {
      pages.push({ page, found: 0, added: 0, endOfResults: true });
      console.log(`HomeHoliday Casa.it: pagina ${page} non disponibile (${response.status}) → fine risultati.`);
      break;
    }
    if (!response.ok) throw new Error(`Casa.it pagina ${page}: HTTP ${response.status}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items = extractFromDocument(doc, url.href);
    const before = all.size;
    items.forEach((item) => all.set(item.externalId, item));
    const added = all.size - before;
    pages.push({ page, found: items.length, added });

    console.log(`HomeHoliday Casa.it: pagina ${page}: ${items.length} letti, ${added} nuovi, totale ${all.size}.`);

    if (added === 0) consecutiveEmpty += 1;
    else consecutiveEmpty = 0;

    if (consecutiveEmpty >= 2) {
      console.log('HomeHoliday Casa.it: due pagine senza nuovi annunci → fine risultati.');
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
    provider: 'Casa.it',
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
  a.download = `homeholiday-casa-${capturedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

  const validPages = pages.filter((p) => !p.endOfResults).length;
  console.log(`HomeHoliday Casa.it: completato. ${listings.length} annunci da ${validPages} pagine valide.`);
  alert(`HomeHoliday Casa.it: ${listings.length} annunci esportati da ${validPages} pagine valide.`);
})();
