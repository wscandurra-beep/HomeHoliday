/*
HomeHoliday – Casa.it session exporter v2
Run from Chrome/Edge DevTools > Sources > Snippets while the filtered Casa.it SRP is open.
This version reads the LIVE rendered DOM for the current page, then navigates the browser page-by-page.
That is intentional: Casa.it can return a shell to fetch(), while the visible browser DOM contains the listings.
Progress is persisted in window.name so it survives same-tab navigation. No installation is required.
*/
(async () => {
  const MAX_PRICE = 260000;
  const MAX_PAGES = 50;
  const STATE_PREFIX = '__HOMEHOLIDAY_CASA_V2__';
  const clean = (value = '') => String(value).replace(/\s+/g, ' ').trim();

  function moneyToNumber(value = '') {
    const normalized = String(value).replace(/\u00a0/g, ' ');
    const patterns = [/(?:Asta\s+da\s+)?€\s*([\d.]+(?:,\d{1,2})?)/gi, /([\d.]+(?:,\d{1,2})?)\s*€/gi];
    for (const pattern of patterns) {
      for (const match of normalized.matchAll(pattern)) {
        const n = Number(match[1].replace(/\./g, '').replace(',', '.'));
        if (n > 0 && n <= MAX_PRICE) return n;
      }
    }
    return null;
  }

  function extractId(href = '') {
    return href.match(/\/immobili\/(\d+)\/?/i)?.[1] || href.match(/(?:id|listingId|propertyId)[=/:-](\d{5,})/i)?.[1] || null;
  }

  function findCard(link) {
    let node = link;
    for (let i = 0; node && i < 9; i += 1, node = node.parentElement) {
      const text = clean(node.textContent || '');
      if (text.length >= 60 && /€|Asta\s+da/i.test(text) && /m²|mq|local[ei]|bagni?|piano/i.test(text)) return node;
    }
    return link.closest('article,li,[data-testid],[class*="card"],[class*="listing"],[class*="property"]') || link.parentElement;
  }

  function extractFromLiveDocument() {
    const result = new Map();
    const anchors = [...document.querySelectorAll('a[href]')];
    for (const link of anchors) {
      let href;
      try { href = new URL(link.getAttribute('href'), location.href).href.split('#')[0]; } catch { continue; }
      const externalId = extractId(href);
      if (!externalId || result.has(externalId)) continue;

      const card = findCard(link);
      const text = clean(card?.textContent || '');
      const price = moneyToNumber(text);
      if (!price || price > MAX_PRICE) continue;

      const heading = card?.querySelector('h1,h2,h3,h4,h5,[class*="title"],[data-testid*="title"]');
      let title = clean(heading?.textContent || link.textContent || '');
      if (!title || title.length < 5 || title.length > 220) {
        title = clean(text.match(/(?:Monolocale|Bilocale|Trilocale|Quadrilocale|Pentalocale|Appartamento|Attico|Mansarda|Casa\s+(?:indipendente|bifamiliare)|Villa|Rustico|Baita|Bungalow|Chalet)[^€]{0,170}/i)?.[0] || `Immobile Casa.it ${externalId}`);
      }

      const sqm = text.match(/(\d{1,4})\s*(?:m²|mq|m2)\b/i)?.[1];
      const rooms = text.match(/(\d{1,2})\s*(?:locali|locale|vani|vano)\b/i)?.[1];
      const sellerType = /Inserzionista\s+privato|\bPrivato\b/i.test(text) ? 'Privato' : 'Agenzia';

      let agencyName;
      if (sellerType === 'Agenzia') {
        const contact = [...(card?.querySelectorAll('img[alt], [class*="agency"], [class*="brand"], [class*="advertiser"], [data-testid*="agency"]') || [])];
        for (const node of contact) {
          const candidate = clean(node.getAttribute?.('alt') || node.textContent || '');
          if (candidate && candidate.length >= 3 && candidate.length <= 100 && !/^(facciata|salone|soggiorno|cucina|camera|vista|terrazzo|giardino|interno|esterno|planimetria|altro)$/i.test(candidate)) { agencyName = candidate; break; }
        }
      }

      result.set(externalId, {
        id: `casa-${externalId}`, externalId, title, location: 'Bardonecchia', price,
        sellerType, agencyName: agencyName || undefined, source: 'Casa.it', sourceUrl: href,
        sqm: sqm ? Number(sqm) : undefined, rooms: rooms ? Number(rooms) : undefined, status: 'ACTIVE'
      });
    }
    return [...result.values()];
  }

  function loadState() {
    if (!window.name.startsWith(STATE_PREFIX)) return null;
    try { return JSON.parse(window.name.slice(STATE_PREFIX.length)); } catch { return null; }
  }
  function saveState(state) { window.name = STATE_PREFIX + JSON.stringify(state); }
  function clearState() { if (window.name.startsWith(STATE_PREFIX)) window.name = ''; }

  function currentPage() {
    const n = Number(new URL(location.href).searchParams.get('page') || '1');
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  function download(state) {
    const capturedAt = new Date().toISOString();
    const listings = Object.values(state.listings).map((item) => ({ ...item, firstSeenAt: state.startedAt, lastSeenAt: capturedAt, priceHistory: [{ price: item.price, capturedAt }] }));
    const payload = { provider: 'Casa.it', search: 'Bardonecchia vendita ≤ €260.000', sourcePage: state.sourcePage, capturedAt, pages: state.pages, count: listings.length, listings };
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = blobUrl; a.download = `homeholiday-casa-${capturedAt.slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    clearState();
    console.log(`HomeHoliday Casa.it: completato. ${listings.length} annunci.`);
    alert(`HomeHoliday Casa.it: ${listings.length} annunci esportati. Carica il JSON in ChatGPT.`);
  }

  const page = currentPage();
  let state = loadState();
  if (!state || page === 1 && state.lastProcessedPage >= page) {
    state = { startedAt: new Date().toISOString(), sourcePage: location.href, pages: [], listings: {}, lastProcessedPage: 0, emptyPages: 0 };
  }

  // Give client-side rendering a moment if the snippet was run immediately after navigation.
  if (document.readyState !== 'complete') await new Promise((resolve) => addEventListener('load', resolve, { once: true }));
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const items = extractFromLiveDocument();
  const before = Object.keys(state.listings).length;
  for (const item of items) state.listings[item.externalId] = item;
  const added = Object.keys(state.listings).length - before;
  state.pages.push({ page, found: items.length, added });
  state.lastProcessedPage = page;
  state.emptyPages = added === 0 ? state.emptyPages + 1 : 0;
  saveState(state);
  console.log(`HomeHoliday Casa.it: pagina ${page}: ${items.length} letti, ${added} nuovi, totale ${Object.keys(state.listings).length}.`);

  // Safety: page 1 must contain visible listings. If not, stop rather than export an empty dataset.
  if (page === 1 && items.length === 0) {
    clearState();
    alert('HomeHoliday Casa.it: non ho riconosciuto annunci nella pagina visibile. Non è stato creato alcun JSON.');
    return;
  }

  const next = new URL(location.href);
  next.searchParams.set('page', String(page + 1));
  const nextLink = [...document.querySelectorAll('a[href]')].find((a) => {
    try { return Number(new URL(a.href, location.href).searchParams.get('page')) === page + 1; } catch { return false; }
  });

  if (page >= MAX_PAGES || state.emptyPages >= 1 || !nextLink) {
    download(state);
    return;
  }

  console.log(`HomeHoliday Casa.it: apro pagina ${page + 1}. Dopo il caricamento riesegui lo stesso Snippet con Ctrl+Enter.`);
  location.href = nextLink.href || next.href;
})();
