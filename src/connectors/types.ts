import type { Listing } from '../types';

export type TrackerQuery = {
  location: string;
  minPrice: number;
  maxPrice: number;
};

export interface PropertyConnector {
  name: string;
  search(query: TrackerQuery): Promise<Listing[]>;
}
