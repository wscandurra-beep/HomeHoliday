import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnnotation, migrateAnnotations, decodeCloudAnnotation, encodeCloudNote, legacyVisibilityUpdates } from '../src/annotations.mjs';

test('retroactively hides both legacy flags, preserving notes and other statuses', () => {
  for (const flag of ['Non interessante', 'Venduto']) {
    const annotation = normalizeAnnotation({ flag, note: 'Nota originale\nSeconda riga', hidden: false });
    assert.equal(annotation.hidden, true);
    assert.equal(annotation.note, 'Nota originale\nSeconda riga');
    assert.equal(annotation.flag, flag);
  }
  assert.equal(normalizeAnnotation({ flag: 'Interessante', hidden: false }).hidden, false);
  assert.equal(normalizeAnnotation({ flag: '', hidden: true }).hidden, true);
});

test('local cleanup is idempotent and preserves explicit restores', () => {
  const migrated = migrateAnnotations({ old: { flag: 'Venduto', note: 'Keep', hidden: false } });
  assert.equal(migrated.old.hidden, true);
  assert.deepEqual(migrateAnnotations(migrated), migrated);
  const restored = { ...migrated.old, hidden: false };
  assert.equal(normalizeAnnotation(restored).hidden, false);
});

test('cloud cleanup adds only the hidden marker and retains row metadata', () => {
  const row = { flag: 'Non interessante', note: 'Original\nNote', updated_at: '2026-01-01', listing_key: 'a' };
  const updates = legacyVisibilityUpdates([row, { ...row, flag: 'Interessante' }]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].row, row);
  assert.equal(updates[0].note, '[[HOMEHOLIDAY:HIDDEN]]\nOriginal\nNote');
  assert.equal(row.note, 'Original\nNote');
  assert.deepEqual(legacyVisibilityUpdates([{ ...row, note: updates[0].note }]), []);
});

test('cloud restore survives another device hydration without losing flag or notes', () => {
  for (const flag of ['Non interessante', 'Venduto']) {
    const annotation = decodeCloudAnnotation({ flag, note: 'Original\nNote' });
    assert.equal(annotation.hidden, true);
    const note = encodeCloudNote({ ...annotation, hidden: false });
    const restored = decodeCloudAnnotation({ flag, note });
    assert.equal(restored.hidden, false);
    assert.equal(restored.note, 'Original\nNote');
    assert.equal(restored.flag, flag);
    assert.deepEqual(legacyVisibilityUpdates([{ flag, note }]), []);
  }
});
