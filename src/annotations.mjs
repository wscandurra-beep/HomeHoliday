const HIDDEN_MARKER = '[[HOMEHOLIDAY:HIDDEN]]';
const VISIBLE_MARKER = '[[HOMEHOLIDAY:VISIBLE]]';

export function autoHideFlag(flag) {
  return flag === 'Non interessante' || flag === 'Venduto';
}

export function normalizeAnnotation(annotation = {}) {
  const flag = annotation.flag ?? '';
  return {
    flag,
    note: annotation.note ?? '',
    hidden: annotation.visibilityRuleVersion === 1
      ? annotation.hidden ?? false
      : Boolean(annotation.hidden || autoHideFlag(flag)),
    visibilityRuleVersion: 1,
  };
}

export function migrateAnnotations(annotations) {
  return Object.fromEntries(Object.entries(annotations).map(([key, value]) => [key, normalizeAnnotation(value)]));
}

function hasMarker(note, marker) {
  return note === marker || note.startsWith(`${marker}\n`);
}

export function decodeCloudAnnotation(row) {
  const note = row.note ?? '';
  const hidden = hasMarker(note, HIDDEN_MARKER);
  const visible = hasMarker(note, VISIBLE_MARKER);
  const marker = hidden ? HIDDEN_MARKER : visible ? VISIBLE_MARKER : '';
  return {
    flag: row.flag,
    note: marker ? note.slice(marker.length).replace(/^\n/, '') : note,
    hidden: hidden || (!visible && autoHideFlag(row.flag)),
    visibilityRuleVersion: 1,
  };
}

export function encodeCloudNote(annotation) {
  if (annotation.hidden) return `${HIDDEN_MARKER}\n${annotation.note}`;
  // Explicit restore must survive hydration and sharing with another device.
  if (autoHideFlag(annotation.flag)) return `${VISIBLE_MARKER}\n${annotation.note}`;
  return annotation.note;
}

export function legacyVisibilityUpdates(rows) {
  return rows.flatMap(row => {
    const annotation = decodeCloudAnnotation(row);
    const note = encodeCloudNote(annotation);
    return autoHideFlag(row.flag) && note !== row.note ? [{ row, note }] : [];
  });
}
