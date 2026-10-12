import { clampRetention, DEFAULT_RETENTION } from './scheduler';

export type Settings = {
  /** FSRS desired retention, 0.80–0.95. The only scheduling setting users see. */
  retention: number;
  /** Show Again/Hard/Good/Easy instead of Forgot/Got it. */
  fourButtons: boolean;
  /** Read the front aloud when a card appears, and the back when it is flipped. */
  readAloud: boolean;
  newPerDay: number;
  reminderEnabled: boolean;
  /** Reminder time as minutes after midnight, local time. */
  reminderMinutes: number;
  /** Home's deck list order. */
  deckSort: DeckSort;
};

export type DeckSort = 'name' | 'color';

export const DEFAULT_SETTINGS: Settings = {
  retention: DEFAULT_RETENTION,
  fourButtons: false,
  readAloud: false,
  newPerDay: 20,
  reminderEnabled: false,
  reminderMinutes: 20 * 60,
  deckSort: 'name',
};

export const NEW_PER_DAY_MAX = 200;

/** Database keys (settings table). */
export const SETTING_KEYS = {
  retention: 'target_retention',
  fourButtons: 'four_buttons',
  readAloud: 'read_aloud',
  newPerDay: 'new_cards_per_day',
  reminderEnabled: 'reminder_enabled',
  reminderMinutes: 'reminder_minutes',
  deckSort: 'deck_sort',
} as const satisfies Record<keyof Settings, string>;

/** Set once the welcome decks have been created (stops them coming back after you delete them). */
export const SEEDED_KEY = 'seeded';

/**
 * Random id for this install, sent with AI requests for the daily quota. Never copied to another
 * phone (two phones would share a quota); Phase 6 links devices to an optional account instead.
 */
export const DEVICE_ID_KEY = 'device_id';

/**
 * The user allowed "Create with AI" to send their text to Google Gemini (Apple requires explicit
 * permission before data goes to a third-party AI, guideline 5.1.2(i); Android asks the same). Per phone.
 */
export const AI_CONSENT_KEY = 'ai_consent';

/** Settings that belong to this device and are left out of backups (and, later, sync). */
export const DEVICE_SETTING_KEYS: readonly string[] = [
  SEEDED_KEY,
  DEVICE_ID_KEY,
  AI_CONSENT_KEY,
  SETTING_KEYS.reminderEnabled,
  SETTING_KEYS.reminderMinutes,
];

function decode(value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Read typed settings from raw key/value rows, falling back to defaults for anything invalid. */
export function parseSettings(rows: readonly { key: string; value: string }[]): Settings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const get = (k: keyof Settings) => decode(map.get(SETTING_KEYS[k]));
  const retention = get('retention');
  const fourButtons = get('fourButtons');
  const readAloud = get('readAloud');
  const reminderEnabled = get('reminderEnabled');
  const deckSort = get('deckSort');
  return {
    retention:
      typeof retention === 'number' ? clampRetention(retention) : DEFAULT_SETTINGS.retention,
    fourButtons: typeof fourButtons === 'boolean' ? fourButtons : DEFAULT_SETTINGS.fourButtons,
    readAloud: typeof readAloud === 'boolean' ? readAloud : DEFAULT_SETTINGS.readAloud,
    newPerDay: int(get('newPerDay'), DEFAULT_SETTINGS.newPerDay, 0, NEW_PER_DAY_MAX),
    reminderEnabled:
      typeof reminderEnabled === 'boolean' ? reminderEnabled : DEFAULT_SETTINGS.reminderEnabled,
    reminderMinutes: int(get('reminderMinutes'), DEFAULT_SETTINGS.reminderMinutes, 0, 24 * 60 - 1),
    deckSort: deckSort === 'color' ? 'color' : 'name',
  };
}
