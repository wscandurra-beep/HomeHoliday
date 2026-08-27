import { extractAnchors, htmlToText, normalizeText, parseAttributes } from './html-utils.mjs';

const PROPERTY_URLS = {
  'Casa.it': /https?:\/\/(?:www\.)?casa\.it\/immobili\/(\d+)\/?/i,
  Idealista: /https?:\/\/(?:www\.)?idealista\.it\/immobile\/(\d+)\/?/i,
  'Immobiliare.it': /https?:\/\/(?:www\.)?immobiliare\.it\/annunci\/(\d+)\/?/i
};

function canonicalUrl(provider, id) {
  if (provider === 'Casa.it') return `https://www.casa.it/immobili/${id}/`;
  if (provider === 'Idealista') return `https://www.idealista.it/immobile/${id}/`;
  return `https://www.immobiliare.it/annunci/${id}/`;
}

function usefulTitle(label, location) {
  const text = normalizeText(label);
  if (!text || !text.includes(normalizeText(location))) return false;
  return !/^(vedi|dettagli|vedi dettagli|avvia ricerca|guarda tutti gli annunci)$/.test(text);
}

function groupedDirectCandidates(html, provider, location) {
  const pattern = PROPERTY_URLS[provider];
  const grouped = new Map();
  for (const anchor of extractAnchors(html)) {
    const match = anchor.href.match(pattern);
    if (!match) continue;
    const id = match[1];
    const current = grouped.get(id) ?? [];
    current.push(anchor);
    grouped.set(id, current);
  }
  return [...grouped.entries()].map(([id, anchors]) => ({
    id,
    url: canonicalUrl(provider, id),
    title: anchors.filter((anchor) => usefulTitle(anchor.label, location)).sort((a, b) => b.label.length - a.label.length)[0]?.label
  })).filter((candidate) => candidate.title);
}

function blockForTitle(plainText, title, allTitles) {
  const start = plainText.indexOf(title);
  if (start < 0) return '';
  const next = allTitles
    .map((other) => other === title ? -1 : plainText.indexOf(other, start + title.length))
    .filter((index) => index > start)
    .sort((a, b) => a - b)[0];
  return plainText.slice(start, next > start ? next : start + 800);
}

function buildListings(candidates, provider, html, receivedAt, location, maxPrice) {
  const plainText = htmlToText(html);
  const titles = candidates.map((candidate) => candidate.title);
  const listings = [];
  for (const candidate of candidates) {
    const block = blockForTitle(plainText, candidate.title, titles);
    const attributes = parseAttributes(block);
    if (!attributes.price || attributes.price > maxPrice) continue;
    if (!normalizeText(candidate.title).includes(normalizeText(location))) continue;
    listings.push({
      id: `${provider === 'Casa.it' ? 'casa' : provider === 'Idealista' ? 'idealista' : 'immobiliare'}-${candidate.id}`,
      externalId: candidate.id,
      title: candidate.title,
      location,
      source: provider,
      sourceUrl: candidate.url,
      price: attributes.price,
      ...(attributes.sqm ? { sqm: attributes.sqm } : {}),
      ...(attributes.rooms ? { rooms: attributes.rooms } : {}),
      receivedAt,
      firstSeenAt: receivedAt,
      lastSeenAt: receivedAt,
      status: 'NEW',
      priceHistory: [{ price: attributes.price, capturedAt: receivedAt }]
    });
  }
  return listings;
}

function detectProvider(from = '') {
  const sender = String(from).toLowerCase();
  if (sender.includes('casa.it')) return 'Casa.it';
  if (sender.includes('immobiliare.it')) return 'Immobiliare.it';
  if (sender.includes('idealista.it')) return 'Idealista';
  return undefined;
}

function trackingCandidates(html, location) {
  const grouped = new Map();
  for (const anchor of extractAnchors(html)) {
    let host;
    try { host = new URL(anchor.href).hostname.toLowerCase(); }
    catch { continue; }
    if (host !== 'clicks.immobiliare.it') continue;
    const current = grouped.get(anchor.href) ?? [];
    current.push(anchor);
    grouped.set(anchor.href, current);
  }
  return [...grouped.entries()].map(([trackingUrl, anchors]) => ({
    trackingUrl,
    title: anchors.filter((anchor) => usefulTitle(anchor.label, location)).sort((a, b) => b.label.length - a.label.length)[0]?.label
  })).filter((candidate) => candidate.title);
}

function pageVerifiesCandidate(body, candidate, location, attributes) {
  const text = normalizeText(htmlToText(body));
  if (!text.includes(normalizeText(location))) return false;
  const meaningful = normalizeText(candidate.title).split(' ').filter((word) => word.length > 3 && word !== normalizeText(location));
  if (meaningful.filter((word) => text.includes(word)).length < Math.min(3, meaningful.length)) return false;
  const digits = text.replace(/\D/g, '');
  if (attributes.price && !digits.includes(String(Math.round(attributes.price)))) return false;
  if (attributes.sqm && !new RegExp(`\\b${Math.round(attributes.sqm)}\\b`).test(text)) return false;
  return true;
}

export async function resolveImmobiliareCandidate(candidate, block, fetchImpl = fetch, location = 'Bardonecchia') {
  let url;
  try { url = new URL(candidate.trackingUrl); }
  catch { return undefined; }
  if (url.protocol !== 'https:' || url.hostname !== 'clicks.immobiliare.it') return undefined;

  const response = await fetchImpl(candidate.trackingUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': 'HomeHoliday/1.0 (+https://github.com/wscandurra-beep/HomeHoliday)' }
  });
  const direct = String(response.url ?? '').match(PROPERTY_URLS['Immobiliare.it']);
  if (direct) return { id: direct[1], url: canonicalUrl('Immobiliare.it', direct[1]), title: candidate.title };
  if (!response.ok) return undefined;

  const body = await response.text();
  const ids = [...new Set([...body.matchAll(/immobiliare\.it\/annunci\/(\d+)/gi)].map((match) => match[1]))];
  const attributes = parseAttributes(block);
  if (ids.length !== 1 || !pageVerifiesCandidate(body, candidate, location, attributes)) return undefined;
  return { id: ids[0], url: canonicalUrl('Immobiliare.it', ids[0]), title: candidate.title };
}

export async function parseAlertMessage(message, options = {}) {
  const provider = detectProvider(message.from);
  if (!provider) return { provider: undefined, listings: [], unresolved: [], candidateCount: 0, excluded: 0 };
  const location = options.location ?? 'Bardonecchia';
  const maxPrice = Number(options.maxPrice ?? 260000);
  const receivedAt = message.internalDate;
  const html = message.html || message.text || '';
  if (!html || !normalizeText(htmlToText(html)).includes(normalizeText(location))) {
    return { provider, listings: [], unresolved: [], candidateCount: 0, excluded: 0 };
  }

  if (provider !== 'Immobiliare.it') {
    const candidates = groupedDirectCandidates(html, provider, location);
    const listings = buildListings(candidates, provider, html, receivedAt, location, maxPrice);
    return { provider, listings, unresolved: [], candidateCount: candidates.length, excluded: candidates.length - listings.length };
  }

  const plainText = htmlToText(html);
  const rawCandidates = trackingCandidates(html, location);
  const titles = rawCandidates.map((candidate) => candidate.title);
  const resolved = [];
  const unresolved = [];
  for (const candidate of rawCandidates) {
    const block = blockForTitle(plainText, candidate.title, titles);
    const attributes = parseAttributes(block);
    if (!attributes.price || attributes.price > maxPrice) continue;
    try {
      const direct = await resolveImmobiliareCandidate(candidate, block, options.fetchImpl, location);
      if (direct) resolved.push(direct);
      else unresolved.push({ provider, title: candidate.title, receivedAt, reason: 'Canonical numeric listing ID could not be verified' });
    } catch (error) {
      unresolved.push({ provider, title: candidate.title, receivedAt, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  const listings = buildListings(resolved, provider, html, receivedAt, location, maxPrice);
  return {
    provider,
    listings,
    unresolved,
    candidateCount: rawCandidates.length,
    excluded: rawCandidates.length - listings.length - unresolved.length
  };
}
