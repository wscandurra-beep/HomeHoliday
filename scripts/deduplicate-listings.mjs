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
  'generale', 'giuseppe', 'in', 'nel', 'vendita'
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

export function likelySameProperty(a, b) {
  if (a.source === b.source) return false;
  if (normalizeText(a.location) !== normalizeText(b.location)) return false;

  const aAddress = addressFingerprint(a.title, a.location);
  const bAddress = addressFingerprint(b.title, b.location);

  // An explicit disagreement is definitive, regardless of similar price/size.
  if (aAddress && bAddress) {
    if (aAddress.street !== bAddress.street) return false;
    if (aAddress.civic && bAddress.civic && aAddress.civic !== bAddress.civic) return false;

    if (!closeEnough(a.price, b.price, 0.03)) return false;
    if (!closeEnough(a.sqm, b.sqm, 0.05)) return false;
    if (a.rooms != null && b.rooms != null && Number(a.rooms) !== Number(b.rooms)) return false;

    // Street + civic is strong enough even when a portal omits surface area.
    if (aAddress.civic && bAddress.civic) return true;
  }

  // A newly published listing may hide the address or use only an agency code.
  // In that case pair it only with another NEW cross-portal listing observed on
  // the same day and with a complete, nearly identical attribute set.
  return newOnSameDay(a, b) && strictAttributeMatch(a, b);
}

export function annotateDuplicateGroups(listings) {
  const groups = [];
  const seededIndexes = new Set();

  // Attribute-only matches are intentionally limited to same-day NEW
  // listings. Once such a match has been verified, keep that identity on
  // later runs instead of trying to infer it again from ACTIVE history.
  const existingGroups = new Map();
  listings.forEach((listing, index) => {
    if (!listing.duplicateGroupId) return;
    const members = existingGroups.get(listing.duplicateGroupId) ?? [];
    members.push(index);
    existingGroups.set(listing.duplicateGroupId, members);
  });
  for (const members of existingGroups.values()) {
    const sources = members.map((index) => listings[index].source);
    if (members.length < 2 || new Set(sources).size !== sources.length) continue;
    groups.push(members);
    members.forEach((index) => seededIndexes.add(index));
  }

  for (let index = 0; index < listings.length; index += 1) {
    if (seededIndexes.has(index)) continue;
    const listing = listings[index];
    const group = groups.find((members) =>
      !members.some((memberIndex) => listings[memberIndex].source === listing.source)
      && members.every((memberIndex) => likelySameProperty(listings[memberIndex], listing))
    );
    if (group) group.push(index);
    else groups.push([index]);
  }

  const result = listings.map(({ duplicateGroupId: _group, duplicateSources: _sources, ...listing }) => listing);
  for (const members of groups.filter((group) => group.length > 1)) {
    const seed = members.map((i) => `${result[i].source}:${result[i].externalId}`).sort().join('|');
    const groupId = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 10);
    const sources = members.map((i) => result[i].source);
    members.forEach((i) => {
      result[i].duplicateGroupId = groupId;
      result[i].duplicateSources = sources;
    });
  }
  return result;
}
