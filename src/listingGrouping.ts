import type { Listing } from './types';

export const MATCH_THRESHOLD = 0.8;

export type GroupingOverrides = {
  manualGroups: string[][];
  separatedPairs: string[];
};

export type ListingGroup = { id: string; primary: Listing; sources: Listing[] };

export function listingIdentity(listing: Listing) {
  return `${listing.source}:${listing.externalId}`;
}

function normalized(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it-IT')
    .replace(/\b(?:s\s*\.?\s*n\s*\.?\s*c\.?|snc)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const ADDRESS_MARKERS = new Set(['via', 'viale', 'corso', 'piazza', 'strada', 'vicolo', 'borgata', 'frazione', 'localita']);
const ADDRESS_NOISE = new Set(['in', 'vendita', 'a', 'centro']);

export function normalizedAddress(listing: Pick<Listing, 'title' | 'location'>) {
  const words = normalized(listing.title).split(' ').filter(Boolean);
  const marker = words.findIndex(word => ADDRESS_MARKERS.has(word));
  if (marker < 0) return '';
  const location = new Set(normalized(listing.location).split(' '));
  return words.slice(marker + 1)
    .filter(word => !/^\d{1,4}[a-z]?$/.test(word) && !location.has(word) && !ADDRESS_NOISE.has(word))
    .join(' ');
}

function tokenScore(left: string, right: string) {
  const a = new Set(normalized(left).split(' ').filter(Boolean));
  const b = new Set(normalized(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(token => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

function toleranceScore(a: number | undefined, b: number | undefined, tolerance: number) {
  if (a == null || b == null || a <= 0 || b <= 0) return 0;
  const difference = Math.abs(a - b) / Math.max(a, b);
  return Math.max(0, 1 - difference / tolerance);
}

export function similarityScore(a: Listing, b: Listing) {
  const city = normalized(a.location) === normalized(b.location) ? 1 : 0;
  if (!city) return 0;
  const addressA = normalizedAddress(a), addressB = normalizedAddress(b);
  const address = addressA && addressB ? tokenScore(addressA, addressB) : 0;
  const surface = toleranceScore(a.sqm, b.sqm, 0.05);
  const price = toleranceScore(a.price, b.price, 0.02);
  const text = tokenScore(`${a.title} ${a.location}`, `${b.title} ${b.location}`);
  return 0.35 * address + 0.25 * surface + 0.2 * price + 0.1 * city + 0.1 * text;
}

function pairKey(a: string, b: string) { return [a, b].sort().join('||'); }

function choosePrimary(items: Listing[]) {
  return [...items].sort((a, b) => {
    const detail = (item: Listing) => item.title.length + (item.sqm != null ? 20 : 0) + (item.rooms != null ? 10 : 0);
    const detailDifference = detail(b) - detail(a);
    if (detailDifference) return detailDifference;
    return new Date(b.publishedAt || b.lastSeenAt).getTime() - new Date(a.publishedAt || a.lastSeenAt).getTime();
  })[0];
}

export function groupListings(items: Listing[], overrides: GroupingOverrides): ListingGroup[] {
  const parent = items.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const indexes = new Map(items.map((item, index) => [listingIdentity(item), index]));
  const separated = new Set(overrides.separatedPairs || []);

  for (const manualGroup of overrides.manualGroups || []) {
    const present = manualGroup.map(key => indexes.get(key)).filter((value): value is number => value != null);
    present.slice(1).forEach(index => union(present[0], index));
  }
  for (let a = 0; a < items.length; a += 1) for (let b = a + 1; b < items.length; b += 1) {
    const left = listingIdentity(items[a]), right = listingIdentity(items[b]);
    if (separated.has(pairKey(left, right))) continue;
    const alreadyManual = find(a) === find(b);
    const preGrouped = items[a].duplicateGroupId && items[a].duplicateGroupId === items[b].duplicateGroupId;
    if (alreadyManual || preGrouped || similarityScore(items[a], items[b]) >= MATCH_THRESHOLD) union(a, b);
  }
  const buckets = new Map<number, Listing[]>();
  items.forEach((item, index) => buckets.set(find(index), [...(buckets.get(find(index)) || []), item]));
  return [...buckets.values()].map(sources => {
    const keys = sources.map(listingIdentity).sort();
    return { id: keys.length > 1 ? `group:${keys.join('|')}` : `single:${keys[0]}`, primary: choosePrimary(sources), sources };
  }).sort((a, b) => new Date(b.primary.firstSeenAt).getTime() - new Date(a.primary.firstSeenAt).getTime());
}

export function separateListing(overrides: GroupingOverrides, listing: Listing, group: ListingGroup): GroupingOverrides {
  const key = listingIdentity(listing);
  const pairs = group.sources.filter(item => listingIdentity(item) !== key).map(item => pairKey(key, listingIdentity(item)));
  return {
    separatedPairs: [...new Set([...(overrides.separatedPairs || []), ...pairs])],
    manualGroups: (overrides.manualGroups || []).map(groupKeys => groupKeys.filter(item => item !== key)).filter(groupKeys => groupKeys.length > 1),
  };
}

export function mergeGroups(overrides: GroupingOverrides, groups: ListingGroup[]): GroupingOverrides {
  const keys = [...new Set(groups.flatMap(group => group.sources.map(listingIdentity)))];
  const keySet = new Set(keys);
  return {
    manualGroups: [...(overrides.manualGroups || []).filter(group => !group.some(key => keySet.has(key))), keys],
    separatedPairs: (overrides.separatedPairs || []).filter(pair => {
      const [a, b] = pair.split('||'); return !(keySet.has(a) && keySet.has(b));
    }),
  };
}
