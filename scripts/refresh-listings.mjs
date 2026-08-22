import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchImmobiliareListings } from './connectors/immobiliare-insights.mjs';

const dataDir = path.resolve('data');
const storePath = path.join(dataDir, 'listings.json');
const searchesPath = path.resolve('config/tracked-searches.json');

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(storePath, 'utf8'));
  } catch {
    return { listings: [], refreshedAt: null };
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
  const immobiliareSearches = searches.filter((x) => x.provider === 'immobiliare');

  if (immobiliareSearches.length) {
    incoming.push(...await fetchImmobiliareListings(immobiliareSearches, now));
  }

  return incoming;
}

const now = new Date().toISOString();
const store = await readStore();
const searches = await readSearches();

if (!searches.length) {
  console.log('HomeHoliday refresh skipped: no active tracked searches configured.');
  process.exit(0);
}

const incoming = await collectFromConnectors(searches, now);
const listings = reconcile(store.listings ?? [], incoming, now);
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(storePath, JSON.stringify({ listings, refreshedAt: now }, null, 2) + '\n');
console.log(`HomeHoliday refresh complete: ${incoming.length} incoming, ${listings.length} tracked.`);
