import mongoose from 'mongoose';

export const SETTINGS_TTL_MS = 30000;

let entry = null; // { value, expiresAt }
let generation = 0; // bumped on every invalidation so an in-flight read cannot store stale data

/** Drops the cached general settings; model hooks call it after any write. */
export function invalidateGeneralSettings() {
  generation += 1;
  entry = null;
}

/**
 * General settings as a frozen plain object with schema defaults applied (or null when the document does not exist yet),
 * cached for SETTINGS_TTL_MS. The model is resolved lazily to avoid a circular import.
 */
export async function getGeneralSettings() {
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  const startedAt = generation;
  // Hydrate (not lean) so schema defaults fill fields missing from older documents.
  const doc = await mongoose.model('SystemSetting').findOne({ key: 'general' });
  const value = doc ? Object.freeze(doc.toObject({ versionKey: false })) : null;
  if (startedAt === generation && value) {
    entry = { value, expiresAt: Date.now() + SETTINGS_TTL_MS };
  }
  return value;
}
