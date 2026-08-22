import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchImmobiliareListings } from './connectors/immobiliare-insights.mjs';
import { fetchImmobiliarePublicListings } from './connectors/immobiliare-public.mjs';
import { fetchPublicPortalListings } from './connectors/public-portals.mjs';
import { annotateDuplicateGroups } from './deduplicate-listings.mjs';

const dataDir = path.resolve('public/data');
const storePath = path.join(dataDir, 'listings.json');
const searchesPath = path.resolve('config/tracked-searches.json');
const bootstrapPath = path.resolve('config/bootstrap-listings.json');
const bootstrapDir = path.resolve('config/bootstrap');

const PROVIDER_SOURCE = {
  immobiliare: 'Immobiliare.it',
  'immobiliare-public': 'Immobiliare.it',
  casa: 'Casa.it',
  idealista: 'Idealista',
  subito: 'Subito.it',
  bakeca: 'Bakeca.it'
};

async function readStore() {
  try { return JSON.parse(await fs.readFile(storePath, 'utf8')); }
  catch { return { listings: [], refreshedAt: null, providerStatus: {} }; }
}

async function readSearches() {
  try {
    const searches = JSON.parse(await fs.readFile(searchesPath, 'utf8'));
    return Array.isArray(searches) ? searches.filter((x) => x.active) : [];
  } catch { return []; }
}

async function readJsonArray(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function readBootstrap() {
  const listings = [...await readJsonArray(bootstrapPath)];
  try {
    const files = (await fs.readdir(bootstrapDir)).filter((name) => name.endsWith('.json')).sort();
    for (const file of files) listings.push(...await readJsonArray(path.join(bootstrapDir, file)));
  } catch {}

  const unique = new Map();
  for (const item of listings) {
    if (!item?.source || !item?.externalId) continue;
    unique.set(`${item.source}:${item.externalId}`, item);
  }
  return [...unique.values()];
}

function reconcile(previous, incoming, now, successfulSources) {
  const byKey = new Map(previous.map((x) => [`${x.source}:${x.externalId}`, x]));
  const seen = new Set();
  const next = [];

  for (const item of incoming) {
    const key = `${item.source}:${item.externalId}`;
    seen.add(key);
    const old = byKey.get(key);
    if (!old) {
      next.push({ ...item, status: 'NEW', firstSeenAt: item.firstSeenAt ?? now, lastSeenAt: item.lastSeenAt ?? now, priceHistory: item.priceHistory?.length ? item.priceHistory : [{ price: item.price, capturedAt: now }] });
      continue;
    }
    const priceChanged = old.price !== item.price;
    const wasRemoved = old.status === 'REMOVED';
    next.push({
      ...old,
      ...item,
      status: wasRemoved ? 'BACK_ONLINE' : priceChanged ? 'UPDATED' : 'ACTIVE',
      firstSeenAt: old.firstSeenAt,
      lastSeenAt: now,
      priceHistory: priceChanged ? [...(old.priceHistory ?? []), { price: item.price, capturedAt: now }] : (old.priceHistory ?? item.priceHistory ?? [])
    });
  }

  for (const old of previous) {
    const key = `${old.source}:${old.externalId}`;
    if (seen.has(key)) continue;
    if (successfulSources.has(old.source)) next.push({ ...old, status: 'REMOVED' });
    else next.push(old);
  }
  return next;
}

async function runProvider(provider, providerSearches, now) {
  if (!providerSearches.length) return { listings: [], status: null };
  try {
    let listings = [];
    if (provider === 'immobiliare') listings = await fetchImmobiliareListings(providerSearches, now);
    else if (provider === 'immobiliare-public') listings = await fetchImmobiliarePublicListings(providerSearches, now);
    else listings = await fetchPublicPortalListings(provider, providerSearches, now);
    return { listings, status: { ok: true, checkedAt: now, count: listings.length } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`${provider} unavailable: ${message}`);
    return { listings: [], status: { ok: false, checkedAt: now, message } };
  }
}

async function collectFromConnectors(searches, now) {
  const incoming = [];
  const providerStatus = {};
  const successfulSources = new Set();
  const providers = [...new Set(searches.map((x) => x.provider))];

  for (const provider of providers) {
    const providerSearches = searches.filter((x) => x.provider === provider);
    const result = await runProvider(provider, providerSearches, now);
    if (result.status) providerStatus[provider] = result.status;
    incoming.push(...result.listings);
    if (result.status?.ok && PROVIDER_SOURCE[provider]) successfulSources.add(PROVIDER_SOURCE[provider]);
  }

  return { incoming, providerStatus, successfulSources };
}

const now = new Date().toISOString();
const store = await readStore();
const searches = await readSearches();
const bootstrapListings = await readBootstrap();

if (!searches.length && !bootstrapListings.length) {
  console.log('HomeHoliday refresh skipped: no active tracked searches or bootstrap listings configured.');
  process.exit(0);
}

const { incoming, providerStatus, successfulSources } = await collectFromConnectors(searches, now);
const mergedIncoming = [...incoming, ...bootstrapListings];
const bootstrapSourceCounts = Object.entries(bootstrapListings.reduce((counts, listing) => {
  counts[listing.source] = (counts[listing.source] ?? 0) + 1;
  return counts;
}, {})).sort(([a], [b]) => a.localeCompare(b));
const bootstrapSourceMessage = `Fonti: ${bootstrapSourceCounts.map(([source, count]) => `${source} (${count})`).join(', ')}`;
providerStatus.bootstrap = { ok: true, checkedAt: now, count: bootstrapListings.length, message: bootstrapSourceMessage };
const bootstrapImmobiliareCount = bootstrapSourceCounts.find(([source]) => source === 'Immobiliare.it')?.[1];
if (bootstrapImmobiliareCount && !providerStatus['immobiliare-public'] && !providerStatus.immobiliare) {
  providerStatus['immobiliare-public'] = {
    ok: true,
    checkedAt: now,
    count: bootstrapImmobiliareCount,
    message: 'Dati disponibili dal bootstrap'
  };
}
const reconciled = reconcile(store.listings ?? [], mergedIncoming, now, successfulSources);
const listings = annotateDuplicateGroups(reconciled);
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(storePath, JSON.stringify({ listings, refreshedAt: now, providerStatus }, null, 2) + '\n');

for (const [provider, status] of Object.entries(providerStatus)) {
  console.log(`${provider}: ${status.ok ? `OK (${status.count ?? 0} listings)` : `FAILED (${status.message})`}`);
}
console.log(`HomeHoliday refresh complete: ${incoming.length} live + ${bootstrapListings.length} bootstrap incoming, ${listings.length} tracked.`);
