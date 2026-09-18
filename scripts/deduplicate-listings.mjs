import crypto from 'node:crypto';

const PROPERTY_WORDS = new Set([
  'appartamento', 'attico', 'bilocale', 'casa', 'loft', 'mansarda',
  'monolocale', 'quadrilocale', 'terratetto', 'trilocale', 'villa'
]);

const ADDRESS_MARKERS = new Set([
  'borgata', 'corso', 'frazione', 'localita', 'piazza', 'strada', 'via', 'viale', 'vicolo'
]);

const ADDRESS_NOISE = new Set([
  'a', 'antonio', 'centro', 'del', 'della', 'di', 'f', 'francesco', 'g', 'gen',
  'generale', 'giuseppe', 'in', 'nel', 'vendita',
  // Common variants of "senza numero civico" must not become street words.
  's', 'n', 'c', 'snc'
]);

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function propertyType(title = '') {
  return normalizeText(title).split(' ').find((word) => PROPERTY_WORDS.has(word));
}

/**
 * Extract a conservative street/civic fingerprint from a listing title.
 * Given names and initials are ignored so "Via G. F. Medail" and
 * "Via Giuseppe Francesco Medail" resolve to the same street.
 */
export function addressFingerprint(title = '', location = '') {
  const words = normalizeText(title).split(' ').filter(Boolean);
  const civicIndex = words.findIndex((word) => /^\d{1,4}[a-z]?$/.test(word));
  if (civicIndex < 0) {
    const markerIndex = words.findIndex((word) => ADDRESS_MARKERS.has(word));
    if (markerIndex < 0) return null;
    const locationWords = new Set(normalizeText(location).split(' '));
    const street = words.slice(markerIndex + 1)
      .filter((word) => !locationWords.has(word) && !ADDRESS_NOISE.has(word))
      .join(' ');
    return street ? { street, civic: undefined } : null;
  }

  const markerIndex = words.slice(0, civicIndex).findLastIndex((word) => ADDRESS_MARKERS.has(word));
  const start = markerIndex >= 0 ? markerIndex + 1 : 0;
  const locationWords = new Set(normalizeText(location).split(' '));
  const street = words.slice(start, civicIndex)
    .filter((word) => !PROPERTY_WORDS.has(word))
    .filter((word) => !locationWords.has(word) && !ADDRESS_NOISE.has(word))
    .join(' ');

  return street ? { street, civic: words[civicIndex] } : null;
}

function closeEnough(a, b, tolerance) {
  if (a == null || b == null) return true;
  return Math.abs(Number(a) - Number(b)) / Math.max(Number(a), Number(b)) <= tolerance;
}

function strictAttributeMatch(a, b) {
  if (a.price == null || b.price == null || !closeEnough(a.price, b.price, 0.01)) return false;
  if (a.sqm == null || b.sqm == null || Math.abs(Number(a.sqm) - Number(b.sqm)) > 1) return false;
  if (a.rooms == null || b.rooms == null || Number(a.rooms) !== Number(b.rooms)) return false;
  const aType = propertyType(a.title);
  const bType = propertyType(b.title);
  return !aType || !bType || aType === bType || ['appartamento', 'casa'].includes(aType) || ['appartamento', 'casa'].includes(bType);
}

function newOnSameDay(a, b) {
  if (a.status !== 'NEW' || b.status !== 'NEW') return false;
  const aDate = a.publishedAt || a.firstSeenAt;
  const bDate = b.publishedAt || b.firstSeenAt;
  if (!aDate || !bDate) return false;
  return String(aDate).slice(0, 10) === String(bDate).slice(0, 10);
}

export function similarityScore(a, b) {
  if (normalizeText(a.location) !== normalizeText(b.location)) return 0;
  const aAddress = addressFingerprint(a.title, a.location);
  const bAddress = addressFingerprint(b.title, b.location);
  const address = aAddress && bAddress ? tokenScore(aAddress.street, bAddress.street) : 0;
  const surface = toleranceScore(a.sqm, b.sqm, 0.05);
  const price = toleranceScore(a.price, b.price, 0.02);
  const text = tokenScore(`${a.title} ${a.location}`, `${b.title} ${b.location}`);
  return 0.35 * address + 0.25 * surface + 0.2 * price + 0.1 + 0.1 * text;
}

function tokenScore(a, b) {
  const left = new Set(normalizeText(a).split(' ').filter(Boolean));
  const right = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter(token => right.has(token)).length;
  return intersection / new Set([...left, ...right]).size;
}

function toleranceScore(a, b, tolerance) {
  if (a == null || b == null || Number(a) <= 0 || Number(b) <= 0) return 0;
  const difference = Math.abs(Number(a) - Number(b)) / Math.max(Number(a), Number(b));
  return Math.max(0, 1 - difference / tolerance);
}

export function likelySameProperty(a, b) {
  const left = addressFingerprint(a.title, a.location), right = addressFingerprint(b.title, b.location);
  const exactCivic = left?.street === right?.street && left?.civic && left.civic === right?.civic && closeEnough(a.price, b.price, 0.02);
  return similarityScore(a, b) >= 0.8 || Boolean(exactCivic) || (newOnSameDay(a, b) && strictAttributeMatch(a, b));
}

export function annotateDuplicateGroups(listings) {
  const parent = listings.map((_, index) => index);
  const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

  for (let a = 0; a < listings.length; a += 1) {
    for (let b = a + 1; b < listings.length; b += 1) {
      const persisted = listings[a].duplicateGroupId && listings[a].duplicateGroupId === listings[b].duplicateGroupId;
      if (persisted || likelySameProperty(listings[a], listings[b])) union(a, b);
    }
  }

  const groups = new Map();
  listings.forEach((_, index) => groups.set(find(index), [...(groups.get(find(index)) || []), index]));
  const result = listings.map(({ duplicateGroupId: _group, duplicateSources: _sources, ...listing }) => listing);
  for (const members of [...groups.values()].filter(group => group.length > 1)) {
    const seed = members.map(i => `${result[i].source}:${result[i].externalId}`).sort().join('|');
    const groupId = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 10);
    const sources = members.map(i => result[i].source);
    members.forEach(i => { result[i].duplicateGroupId = groupId; result[i].duplicateSources = sources; });
  }
  return result;
}
