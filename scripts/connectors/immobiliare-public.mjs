const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; HomeHoliday/0.1; personal property tracker)',
  'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8'
};

function decode(text='') {
  return text
    .replace(/&nbsp;/g,' ')
    .replace(/&euro;/g,'€')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>');
}

function stripTags(html='') {
  return decode(html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
}

function parsePrice(text) {
  const match = text.match(/€\s*([\d.]+(?:,\d{1,2})?)/);
  if (!match) return undefined;
  return Number(match[1].replace(/\./g,'').replace(',','.'));
}

function parseSqm(text) {
  const match = text.match(/(\d{1,4})\s*m²/i);
  return match ? Number(match[1]) : undefined;
}

function parseRooms(title='') {
  const t = title.toLowerCase();
  if (t.includes('monolocale')) return 1;
  if (t.includes('bilocale')) return 2;
  if (t.includes('trilocale')) return 3;
  if (t.includes('quadrilocale')) return 4;
  const m = t.match(/(\d+)\s*locali/);
  return m ? Number(m[1]) : undefined;
}

function extractTitle(text, location) {
  const kinds = '(?:Monolocale|Bilocale|Trilocale|Quadrilocale|Appartamento|Attico|Mansarda|Loft|Casa|Villa)';
  const re = new RegExp(`${kinds}[^€]{0,180}?(?:${location}|$)`, 'i');
  const match = text.match(re);
  if (match) return match[0].replace(/\s+/g,' ').trim();
  return `Immobile a ${location}`;
}

function listingIds(html) {
  const ids = new Set();
  const re = /(?:https:\/\/www\.immobiliare\.it)?\/annunci\/(\d+)\/?/g;
  let m;
  while ((m = re.exec(html))) ids.add(m[1]);
  return ids;
}

function makeUrl(base, page, minPrice, maxPrice) {
  const url = new URL(base);
  url.searchParams.set('criterio','rilevanza');
  if (minPrice != null) url.searchParams.set('prezzoMinimo', String(minPrice));
  if (maxPrice != null) url.searchParams.set('prezzoMassimo', String(maxPrice));
  if (page > 1) url.searchParams.set('pag', String(page));
  else url.searchParams.delete('pag');
  return url.toString();
}

async function getPage(url) {
  const response = await fetch(url, { headers: DEFAULT_HEADERS, redirect: 'follow' });
  if (response.status === 403 || response.status === 429) {
    throw new Error(`Immobiliare.it public access declined (${response.status}). HomeHoliday will not bypass access controls.`);
  }
  if (!response.ok) throw new Error(`Immobiliare.it public search failed: ${response.status}`);
  return response.text();
}

function extractListings(html, search, privateIds, now) {
  const output = new Map();
  const re = /(?:https:\/\/www\.immobiliare\.it)?\/annunci\/(\d+)\/?/g;
  let match;
  while ((match = re.exec(html))) {
    const externalId = match[1];
    if (output.has(externalId)) continue;
    const start = Math.max(0, match.index - 3500);
    const end = Math.min(html.length, match.index + 3500);
    const text = stripTags(html.slice(start, end));
    const price = parsePrice(text);
    if (!price || price < (search.minPrice ?? 0) || price > (search.maxPrice ?? Number.MAX_SAFE_INTEGER)) continue;
    const title = extractTitle(text, search.location);
    output.set(externalId, {
      id: `immobiliare-${externalId}`,
      externalId,
      title,
      location: search.location,
      price,
      firstSeenAt: now,
      lastSeenAt: now,
      sellerType: privateIds.has(externalId) ? 'Privato' : 'Agenzia',
      source: 'Immobiliare.it',
      sourceUrl: `https://www.immobiliare.it/annunci/${externalId}/`,
      sqm: parseSqm(text),
      rooms: parseRooms(title),
      status: 'ACTIVE',
      priceHistory: []
    });
  }
  return [...output.values()];
}

export async function fetchImmobiliarePublicListings(searches, now = new Date().toISOString()) {
  const result = new Map();
  for (const search of searches) {
    const maxPages = Math.min(Math.max(Number(search.maxPages ?? 3), 1), 5);
    const privateIds = new Set();

    if (search.privateSearchUrl) {
      for (let page = 1; page <= maxPages; page++) {
        const html = await getPage(makeUrl(search.privateSearchUrl, page, search.minPrice, search.maxPrice));
        for (const id of listingIds(html)) privateIds.add(id);
      }
    }

    for (let page = 1; page <= maxPages; page++) {
      const html = await getPage(makeUrl(search.searchUrl, page, search.minPrice, search.maxPrice));
      for (const listing of extractListings(html, search, privateIds, now)) {
        result.set(`${listing.source}:${listing.externalId}`, listing);
      }
    }
  }
  return [...result.values()];
}
