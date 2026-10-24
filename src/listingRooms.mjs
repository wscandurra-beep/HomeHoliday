// Only infer total rooms from explicit room counts or established property names.
// Bedrooms alone do not describe the total number of locali.
export function parseRooms(text = '') {
  const value = String(text).replace(/\u00a0/g, ' ');
  const explicit = value.match(/\b(\d{1,2})\s*(?:local[ei]|vani|loc\.)(?=\W|$)/i)
    ?? value.match(/\b(?:local[ei]|vani)\s*[:\-]?\s*(\d{1,2})\b/i);
  if (explicit && Number(explicit[1]) > 0) return Number(explicit[1]);
  const names = { monolocale: 1, bilocale: 2, trilocale: 3, quadrilocale: 4, pentalocale: 5 };
  const name = value.toLowerCase().match(/\b(monolocale|bilocale|trilocale|quadrilocale|pentalocale)\b/);
  return name ? names[name[1]] : undefined;
}

export function listingRooms(listing) {
  const rooms = Number(listing.rooms);
  return Number.isInteger(rooms) && rooms > 0 ? rooms : parseRooms(listing.title);
}

export function matchesRooms(rooms, filter) {
  if (!filter) return true;
  if (filter === 'unknown') return rooms == null;
  return rooms != null && (filter === '5+' ? rooms >= 5 : rooms === Number(filter));
}
