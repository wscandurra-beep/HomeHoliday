import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchImmobiliareListings } from './connectors/immobiliare-insights.mjs';
import { fetchImmobiliarePublicListings } from './connectors/immobiliare-public.mjs';

const dataDir = path.resolve('public/data');
const storePath = path.join(dataDir, 'listings.json');
const searchesPath = path.resolve('config/tracked-searches.json');

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(storePath, 'utf8'));
  } catch {
    return { listings: [], refreshedAt: null, providerStatus: {} };
  }
}

async function readSearches() {
  try {
    const searches = JSON.parse(await fs.readFile(searchesPath, 'utf8'));
    return Array.isArray(searches) ? searches.filter((x) => x.active) : [];
  } catch {
    return [];
  }
}

function reconcile(previous, incoming, now) {
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
    if (!seen.has(key)) next.push({ ...old, status: 'REMOVED' });
  }
  return next;
}

async function collectFromConnectors(searches, now) {
  const incoming = [];
  const providerStatus = {};
  const officialSearches = searches.filter((x) => x.provider === 'immobiliare');
  const publicSearches = searches.filter((x) => x.provider === 'immobiliare-public');

  if (officialSearches.length) {
    try {
      incoming.push(...await fetchImmobiliareListings(officialSearches, now));
      providerStatus.immobiliare = { ok: true, checkedAt: now };
    } catch (error) {
      providerStatus.immobiliare = { ok: false, checkedAt: now, message: error instanceof Error ? error.message : String(error) };
      console.warn(`Immobiliare API unavailable: ${providerStatus.immobiliare.message}`);
    }
  }

  if (publicSearches.length) {
    try {
      incoming.push(...await fetchImmobiliarePublicListings(publicSearches, now));
      providerStatus['immobiliare-public'] = { ok: true, checkedAt: now };
    } catch (error) {
      providerStatus['immobiliare-public'] = { ok: false, checkedAt: now, message: error instanceof Error ? error.message : String(error) };
      console.warn(`Immobiliare public source unavailable: ${providerStatus['immobiliare-public'].message}`);
    }
  }

  return { incoming, providerStatus };
}

const now = new Date().toISOString();
const store = await readStore();
const searches = await readSearches();

if (!searches.length) {
  console.log('HomeHoliday refresh skipped: no active tracked searches configured.');
  process.exit(0);
}

const { incoming, providerStatus } = await collectFromConnectors(searches, now);
const anyProviderOk = Object.values(providerStatus).some((x) => x.ok);
const listings = anyProviderOk ? reconcile(store.listings ?? [], incoming, now) : (store.listings ?? []);
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(storePath, JSON.stringify({ listings, refreshedAt: now, providerStatus }, null, 2) + '\n');
console.log(`HomeHoliday refresh complete: ${incoming.length} incoming, ${listings.length} tracked.`);
