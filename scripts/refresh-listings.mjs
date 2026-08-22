import fs from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve('data');
const storePath = path.join(dataDir, 'listings.json');

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(storePath, 'utf8'));
  } catch {
    return { listings: [], refreshedAt: null };
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

async function collectFromConnectors() {
  // Real providers will be added here. Each provider must return normalized listings.
  return [];
}

const now = new Date().toISOString();
const store = await readStore();
const incoming = await collectFromConnectors();
const listings = reconcile(store.listings ?? [], incoming, now);
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(storePath, JSON.stringify({ listings, refreshedAt: now }, null, 2) + '\n');
console.log(`HomeHoliday refresh complete: ${incoming.length} incoming, ${listings.length} tracked.`);
