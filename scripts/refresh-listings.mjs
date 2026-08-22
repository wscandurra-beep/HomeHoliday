import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchImmobiliareListings } from './connectors/immobiliare-insights.mjs';
import { fetchImmobiliarePublicListings } from './connectors/immobiliare-public.mjs';
import { fetchPublicPortalListings } from './connectors/public-portals.mjs';

const dataDir = path.resolve('public/data');
const storePath = path.join(dataDir, 'listings.json');
const searchesPath = path.resolve('config/tracked-searches.json');

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

function reconcile(previous, incoming, now, successfulSources) {
  const byKey = new Map(previous.map((x) => [`${x.source}:${x.externalId}`, x]));
  const seen = new Set();
  const next = [];

  for (const item of incoming) {
    const key = `${item.source}:${item.externalId}`;
    seen.add(key);
    const old = byKey.get(key);
    if (!old) {
      next.push({ ...item, status: 'NEW', firstSeenAt: now, lastSeenAt: now, priceHistory: [{ price: item.price, capturedAt: now }] });
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
      priceHistory: priceChanged ? [...(old.priceHistory ?? []), { price: item.price, capturedAt: now }] : (old.priceHistory ?? [])
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

if (!searches.length) {
  console.log('HomeHoliday refresh skipped: no active tracked searches configured.');
  process.exit(0);
}

const { incoming, providerStatus, successfulSources } = await collectFromConnectors(searches, now);
const listings = reconcile(store.listings ?? [], incoming, now, successfulSources);
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(storePath, JSON.stringify({ listings, refreshedAt: now, providerStatus }, null, 2) + '\n');

for (const [provider, status] of Object.entries(providerStatus)) {
  console.log(`${provider}: ${status.ok ? `OK (${status.count ?? 0} listings)` : `FAILED (${status.message})`}`);
}
console.log(`HomeHoliday refresh complete: ${incoming.length} incoming, ${listings.length} tracked.`);
