const DEFAULT_BASE_URL = 'https://comparables.realitycs.it';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseDate(value) {
  if (!value) return undefined;
  const raw = String(value).split('T')[0];
  const parts = raw.includes('/') ? raw.split('/') : raw.split('-');
  if (parts.length !== 3) return undefined;
  if (raw.includes('/')) {
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return raw;
}

async function getAccessToken(baseUrl) {
  const clientId = required('IMMOBILIARE_CLIENT_ID');
  const clientSecret = required('IMMOBILIARE_CLIENT_SECRET');
  const username = required('IMMOBILIARE_USERNAME');
  const password = required('IMMOBILIARE_PASSWORD');
  const body = new URLSearchParams({ grant_type: 'password', username, password });
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!response.ok) throw new Error(`Immobiliare.it auth failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error('Immobiliare.it auth response did not include access_token');
  return payload.access_token;
}

function normalize(item, now) {
  const listingUrl = item.listingUrl ?? '';
  const idFromUrl = listingUrl.match(/\/annunci\/(\d+)/)?.[1];
  const externalId = String(item.listingID ?? idFromUrl ?? item.uuid);
  const price = Number(item.value?.askingPrice ?? item.askingPrice ?? 0);
  const municipality = item.location?.municipality ?? 'Località non disponibile';
  const title = item.extra?.title ?? `${item.propertyType ?? 'Immobile'} a ${municipality}`;
  const client = String(item.clientType ?? '').toLowerCase();

  return {
    id: `immobiliare-${externalId}`,
    externalId,
    title,
    location: municipality,
    price,
    publishedAt: parseDate(item.collectionDate ?? item.lastUpdateDate),
    firstSeenAt: now,
    lastSeenAt: now,
    sellerType: client.includes('privat') ? 'Privato' : 'Agenzia',
    agencyName: undefined,
    source: 'Immobiliare.it',
    sourceUrl: listingUrl,
    sqm: item.grossSquareFootage ? Number(item.grossSquareFootage) : undefined,
    rooms: item.rooms ? Number(item.rooms) : undefined,
    status: 'ACTIVE',
    priceHistory: [],
    coverImage: item.attachments?.coverImage,
    address: item.location?.address,
    municipalityId: item.location?.municipalityID
  };
}

export async function fetchImmobiliareListings(searches, now = new Date().toISOString()) {
  if (!searches.length) return [];
  const baseUrl = process.env.IMMOBILIARE_BASE_URL || DEFAULT_BASE_URL;
  const token = await getAccessToken(baseUrl);
  const limit = Math.min(Math.max(Number(process.env.IMMOBILIARE_PAGE_SIZE || 50), 1), 100);
  const maxPages = Math.max(Number(process.env.IMMOBILIARE_MAX_PAGES || 10), 1);
  const output = new Map();

  for (const search of searches) {
    let page = 1;
    while (page <= maxPages) {
      const response = await fetch(`${baseUrl}/comparables/fullSearchByAttribute`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          Filters: {
            contractTypeID: search.contractTypeID ?? 1,
            municipalityID: String(search.municipalityID),
            minPrice: search.minPrice ?? null,
            maxPrice: search.maxPrice ?? null,
            minGrossSquareFootage: search.minSqm ?? null,
            maxGrossSquareFootage: search.maxSqm ?? null,
            pubblicationStatusID: search.pubblicationStatusID ?? [1, 2],
            clientTypeID: search.clientTypeID ?? null
          },
          Pagination: { page, limit },
          Sorting: { by: 'date', direction: 'desc' }
        })
      });

      if (!response.ok) throw new Error(`Immobiliare.it search failed: ${response.status} ${await response.text()}`);
      const payload = await response.json();
      for (const item of payload.items ?? []) {
        const listing = normalize(item, now);
        if (listing.price > 0) output.set(`${listing.source}:${listing.externalId}`, listing);
      }
      if (!payload._metadata?.pages?.next) break;
      page = Number(payload._metadata.pages.next);
    }
  }

  return [...output.values()];
}
