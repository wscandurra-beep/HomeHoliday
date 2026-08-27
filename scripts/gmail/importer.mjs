import crypto from 'node:crypto';
import { annotateDuplicateGroups } from '../deduplicate-listings.mjs';

const keyOf = (listing) => `${listing.source}:${listing.externalId}`;

function latestIso(...values) {
  return values.filter(Boolean).sort().at(-1);
}

function mergeOne(old, incoming) {
  if (!old) return incoming;
  const priceChanged = Number(old.price) !== Number(incoming.price);
  const priceHistory = [...(old.priceHistory ?? [])];
  if (priceChanged && !priceHistory.some((entry) => Number(entry.price) === Number(incoming.price) && entry.capturedAt === incoming.receivedAt)) {
    priceHistory.push({ price: incoming.price, capturedAt: incoming.receivedAt });
  }
  return {
    ...old,
    ...incoming,
    firstSeenAt: old.firstSeenAt ?? incoming.firstSeenAt,
    lastSeenAt: latestIso(old.lastSeenAt, incoming.lastSeenAt),
    priceHistory: priceHistory.length ? priceHistory : incoming.priceHistory,
    status: old.status === 'REMOVED' ? 'BACK_ONLINE' : priceChanged ? 'UPDATED' : old.status === 'NEW' ? 'ACTIVE' : (old.status ?? 'ACTIVE')
  };
}

export function mergeListings(previous = [], incoming = []) {
  const merged = new Map(previous.map((listing) => [keyOf(listing), listing]));
  for (const listing of incoming) merged.set(keyOf(listing), mergeOne(merged.get(keyOf(listing)), listing));
  return [...merged.values()];
}

export function updateStores(store, emailArchive, incoming, observedAt, summary) {
  const archiveListings = mergeListings(emailArchive, incoming);
  const allListings = annotateDuplicateGroups(mergeListings(store.listings ?? [], incoming));
  return {
    archiveListings,
    store: {
      ...store,
      listings: allListings,
      refreshedAt: latestIso(store.refreshedAt, observedAt),
      providerStatus: {
        ...(store.providerStatus ?? {}),
        emailAlerts: {
          ok: summary.unresolved === 0,
          checkedAt: observedAt,
          count: summary.imported,
          unresolved: summary.unresolved,
          message: `${summary.imported} annunci importati o aggiornati da ${summary.messages} alert Gmail; ${summary.excluded} esclusi o senza dati idonei; ${summary.unresolved} non risolti`
        }
      }
    }
  };
}

export function unresolvedHash(entry) {
  return crypto.createHash('sha256').update(`${entry.provider}|${entry.title}|${entry.receivedAt}|${entry.reason}`).digest('hex');
}
