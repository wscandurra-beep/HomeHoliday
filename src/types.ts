export type SellerType = 'Agenzia' | 'Privato';
export type ListingStatus = 'NEW' | 'UPDATED' | 'ACTIVE' | 'REMOVED' | 'BACK_ONLINE';

export type PricePoint = {
  price: number;
  capturedAt: string;
};

export type Listing = {
  id: string;
  externalId: string;
  title: string;
  location: string;
  price: number;
  publishedAt?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  sellerType: SellerType;
  agencyName?: string;
  source: string;
  sourceUrl: string;
  sqm?: number;
  rooms?: number;
  status: ListingStatus;
  priceHistory: PricePoint[];
};

export type Tracker = {
  id: string;
  name: string;
  location: string;
  minPrice: number;
  maxPrice: number;
  sellerType: 'Tutti' | SellerType;
  active: boolean;
  refreshHours: number;
};
