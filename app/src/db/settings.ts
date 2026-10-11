import { eq } from 'drizzle-orm';

import { parseSettings, SETTING_KEYS, type Settings } from '@/lib/settings';

import { db } from './client';
import { settings } from './schema';

export function getSettings(): Settings {
  return parseSettings(db.select().from(settings).all());
}

export function getRawSetting(key: string): unknown {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

export function setRawSetting(key: string, value: unknown, now = Date.now()): void {
  const row = { key, value: JSON.stringify(value), updated_at: now };
  db.insert(settings)
    .values(row)
    .onConflictDoUpdate({ target: settings.key, set: { value: row.value, updated_at: now } })
    .run();
}

export function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
  now = Date.now(),
): void {
  setRawSetting(SETTING_KEYS[key], value, now);
}
