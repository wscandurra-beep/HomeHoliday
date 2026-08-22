import crypto from 'node:crypto';

const PROPERTY_WORDS = new Set([
  'appartamento', 'attico', 'bilocale', 'casa', 'loft', 'mansarda',
  'monolocale', 'quadrilocale', 'terratetto', 'trilocale', 'villa'
]);

const ADDRESS_MARKERS = new Set([
  'borgata', 'corso', 'frazione', 'localita', 'piazza', 'strada', 'via', 'viale', 'vicolo'
]);

const ADDRESS_NOISE = new Set([
  'a', 'centro', 'del', 'della', 'di', 'f', 'francesco', 'g', 'giuseppe', 'in',
  'nel', 'vendita'
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
  return !aType || !bType || aType === bType;
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

  // With a hidden or incomplete address, group only on a complete, very close
  // set of independent attributes. This deliberately favours false negatives.
  return strictAttributeMatch(a, b);
}

export function annotateDuplicateGroups(listings) {
  const groups = [];

  for (let index = 0; index < listings.length; index += 1) {
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
