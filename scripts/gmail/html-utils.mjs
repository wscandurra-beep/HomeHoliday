const NAMED_ENTITIES = {
  amp: '&', apos: "'", euro: '€', gt: '>', lt: '<', nbsp: ' ', quot: '"', sup2: '²'
};

export function decodeHtml(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&([a-z0-9]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

export function htmlToText(value = '') {
  return decodeHtml(value)
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>|<\/div>|<\/td>|<\/tr>|<\/li>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractAnchors(html = '') {
  const anchors = [];
  for (const match of String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    anchors.push({
      href: decodeHtml(match[1]).replace(/\s+/g, ''),
      label: htmlToText(match[2]),
      index: match.index ?? 0
    });
  }
  return anchors;
}

export function parseItalianNumber(value) {
  if (value == null) return undefined;
  const normalized = String(value).replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

export function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function parseAttributes(block = '') {
  const priceCandidates = [
    [...block.matchAll(/€\s*([\d.]+(?:,\d+)?)/gi)].map((match) => ({ index: match.index, value: match[1] })),
    [...block.matchAll(/(?:da\s+)?([\d.]+(?:,\d+)?)\s*€/gi)].map((match) => ({ index: match.index, value: match[1] }))
  ].flat().sort((a, b) => a.index - b.index);
  const sqmMatch = block.match(/(\d+(?:[.,]\d+)?)\s*m(?:²|2|q)(?=\s|[|<]|$)/i);
  const roomsMatch = block.match(/(\d+)\s*(?:locali?\b|loc\.)/i);
  return {
    price: parseItalianNumber(priceCandidates[0]?.value),
    sqm: parseItalianNumber(sqmMatch?.[1]),
    rooms: roomsMatch ? Number(roomsMatch[1]) : undefined
  };
}
