import crypto from 'node:crypto';

const PROVIDERS = {
  casa: {
    source: 'Casa.it',
    baseUrl: 'https://www.casa.it',
    buildUrl: (s) => `https://www.casa.it/vendita/residenziale/${slug(s.location)}/`,
    detail: (href) => /\/immobili\//i.test(href)
  },
  idealista: {
    source: 'Idealista',
    baseUrl: 'https://www.idealista.it',
    buildUrl: (s) => `https://www.idealista.it/vendita-case/${slug(s.location)}-torino/`,
    detail: (href) => /\/immobile\/\d+/i.test(href)
  },
  subito: {
    source: 'Subito.it',
    baseUrl: 'https://www.subito.it',
    buildUrl: (s) => `https://www.subito.it/annunci-piemonte/vendita/immobili/?q=${encodeURIComponent(s.location)}`,
    detail: (href) => /subito\.it\/.+\.htm(?:\?|$)/i.test(href) || /\/appartamenti\//i.test(href)
  },
  bakeca: {
    source: 'Bakeca.it',
    baseUrl: 'https://torino.bakeca.it',
    buildUrl: (s) => `https://torino.bakeca.it/annunci/case/luogo/${slug(s.location)}/`,
    detail: (href) => /\/dettaglio\/vendita-case\//i.test(href)
  }
};

function slug(value = '') {
  return String(value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function decode(text = '') {
  return text.replace(/&nbsp;|&#160;/gi, ' ').replace(/&euro;|&#8364;/gi, '€').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function stripHtml(html = '') {
  return decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parsePrice(text) {
  const matches = [...text.matchAll(/(?:€\s*)?(\d{1,3}(?:[.\s]\d{3})+|\d{4,7})(?:\s*€)/g)];
  for (const m of matches) {
    const value = Number(m[1].replace(/[.\s]/g, ''));
    if (value >= 10000 && value <= 10000000) return value;
  }
  return 0;
}

function parseSqm(text) {
  const m = text.match(/(\d{1,4})\s*(?:m²|mq|m2)\b/i);
  return m ? Number(m[1]) : undefined;
}

function parseRooms(text) {
  const m = text.match(/(\d{1,2})\s*(?:locali|locale)\b/i);
  return m ? Number(m[1]) : undefined;
}

function parsePublishedAt(text) {
  const m = text.match(/(?:pubblicat[oa]\s*(?:il)?\s*)?(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})/i);
  if (!m) return undefined;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function absolutize(href, baseUrl) {
  try { return new URL(decode(href), baseUrl).toString(); } catch { return ''; }
}

function idFromUrl(url) {
  const numeric = url.match(/(?:immobile|annunci|detail|dettaglio|\-|\/)(\d{6,})(?:[\/?._-]|$)/i)?.[1];
  return numeric ?? crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

function titleFromAnchor(inner, chunk, location) {
  const direct = stripHtml(inner);
  if (direct && direct.length > 4 && !/^\d+$/.test(direct)) return direct.slice(0, 180);
  const heading = chunk.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1];
  const parsed = stripHtml(heading || '');
  return parsed || `Immobile a ${location}`;
}

function addListing(result, provider, search, now, raw) {
  const def = PROVIDERS[provider];
  const location = String(search.location || '').trim();
  const url = absolutize(raw.url || '', def.baseUrl);
  const price = Number(raw.price || 0);
  if (!url || !price || price < (search.minPrice ?? 0) || price > (search.maxPrice ?? Number.MAX_SAFE_INTEGER)) return;
  const externalId = idFromUrl(url);
  result.set(`${def.source}:${externalId}`, {
    id: `${provider}-${externalId}`,
    externalId,
    title: String(raw.title || `Immobile a ${location}`).slice(0, 180),
    location: location || raw.location || 'Località non disponibile',
    price,
    publishedAt: raw.publishedAt,
    firstSeenAt: now,
    lastSeenAt: now,
    sellerType: raw.sellerType || 'Agenzia',
    source: def.source,
    sourceUrl: url,
    sqm: raw.sqm ? Number(raw.sqm) : undefined,
    rooms: raw.rooms ? Number(raw.rooms) : undefined,
    status: 'ACTIVE',
    priceHistory: []
  });
}

function walkJson(value, visit) {
  if (Array.isArray(value)) return value.forEach((x) => walkJson(x, visit));
  if (!value || typeof value !== 'object') return;
  visit(value);
  Object.values(value).forEach((x) => walkJson(x, visit));
}

function parseStructuredListings(html, provider, search, now, result) {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const json = JSON.parse(decode(match[1]).trim());
      walkJson(json, (item) => {
        const offers = item.offers || item.offer || {};
        const price = Number(offers.price ?? offers.lowPrice ?? item.price ?? 0);
        const url = item.url ?? offers.url;
        if (!price || !url) return;
        const text = JSON.stringify(item);
        const location = String(search.location || '').trim();
        if (location && !text.toLowerCase().includes(location.toLowerCase())) return;
        const size = item.floorSize?.value ?? item.floorSize ?? item.area?.value ?? item.area;
        const rooms = item.numberOfRooms ?? item.numberOfBedrooms;
        addListing(result, provider, search, now, {
          url,
          price,
          title: item.name ?? item.headline ?? item.description,
          sqm: size,
          rooms,
          sellerType: /privat[oa]/i.test(text) && !/agenzia/i.test(text) ? 'Privato' : 'Agenzia',
          publishedAt: item.datePosted ? String(item.datePosted).slice(0, 10) : undefined
        });
      });
    } catch { /* ignore malformed structured data */ }
  }
}

function parseListings(html, provider, search, now) {
  const def = PROVIDERS[provider];
  const result = new Map();
  parseStructuredListings(html, provider, search, now, result);

  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html))) {
    const href = match[1];
    if (!def.detail(href)) continue;
    const url = absolutize(href, def.baseUrl);
    if (!url) continue;
    const start = Math.max(0, match.index - 700);
    const end = Math.min(html.length, anchorRe.lastIndex + 1800);
    const chunk = html.slice(start, end);
    const text = stripHtml(chunk);
    const location = String(search.location || '').trim();
    if (location && !text.toLowerCase().includes(location.toLowerCase())) continue;
    const price = parsePrice(text);
    if (!price) continue;
    addListing(result, provider, search, now, {
      url,
      price,
      title: titleFromAnchor(match[2], chunk, location),
      sqm: parseSqm(text),
      rooms: parseRooms(text),
      publishedAt: parsePublishedAt(text),
      sellerType: /\bprivat[oa]\b/i.test(text) && !/\bagenzia\b/i.test(text) ? 'Privato' : 'Agenzia'
    });
  }
  return [...result.values()];
}

async function fetchPage(url, source) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HomeHoliday/0.1; personal-property-tracker)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'it-IT,it;q=0.9,en;q=0.5'
    },
    redirect: 'follow'
  });
  if (response.status === 403 || response.status === 429) throw new Error(`${source} public access declined (${response.status})`);
  if (!response.ok) throw new Error(`${source} request failed (${response.status})`);
  return response.text();
}

export async function fetchPublicPortalListings(provider, searches, now = new Date().toISOString()) {
  const def = PROVIDERS[provider];
  if (!def) throw new Error(`Unsupported public provider: ${provider}`);
  const output = new Map();
  for (const search of searches) {
    const url = search.url || def.buildUrl(search);
    const html = await fetchPage(url, def.source);
    for (const listing of parseListings(html, provider, search, now)) output.set(`${listing.source}:${listing.externalId}`, listing);
  }
  return [...output.values()];
}
