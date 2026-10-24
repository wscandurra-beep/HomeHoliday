export function parseRooms(text?: string): number | undefined;
export function listingRooms(listing: { rooms?: number; title: string }): number | undefined;
export function matchesRooms(rooms: number | undefined, filter: string): boolean;
