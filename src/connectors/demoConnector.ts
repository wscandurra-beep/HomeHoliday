import type { PropertyConnector, TrackerQuery } from './types';
import type { Listing } from '../types';

const demoListings: Listing[] = [
  {
    id: 'demo-1', externalId: 'imm-001', title: 'Trilocale centro', location: 'Bardonecchia',
    price: 235000, publishedAt: '2026-08-22', firstSeenAt: '2026-08-22T06:00:00Z', lastSeenAt: '2026-08-22T06:00:00Z',
    sellerType: 'Agenzia', agencyName: 'Demo Agency', source: 'Immobiliare.it', sourceUrl: '#', sqm: 82, rooms: 3,
    status: 'NEW', priceHistory: [{ price: 235000, capturedAt: '2026-08-22T06:00:00Z' }]
  },
  {
    id: 'demo-2', externalId: 'ide-002', title: 'Bilocale panoramico', location: 'Bardonecchia',
    price: 178000, publishedAt: '2026-08-21', firstSeenAt: '2026-08-21T08:00:00Z', lastSeenAt: '2026-08-22T06:00:00Z',
    sellerType: 'Privato', source: 'Idealista', sourceUrl: '#', sqm: 55, rooms: 2,
    status: 'ACTIVE', priceHistory: [{ price: 185000, capturedAt: '2026-08-21T08:00:00Z' }, { price: 178000, capturedAt: '2026-08-22T06:00:00Z' }]
  }
];

export const demoConnector: PropertyConnector = {
  name: 'demo',
  async search(query: TrackerQuery) {
    const location = query.location.trim().toLowerCase();
    return demoListings.filter((listing) =>
      (!location || listing.location.toLowerCase().includes(location)) &&
      listing.price >= query.minPrice && listing.price <= query.maxPrice
    );
  }
};
