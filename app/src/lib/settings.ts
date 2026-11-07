import type { AppearanceChoice } from './appearance';
import type { LanguageChoice } from './i18n';
import { isLanguage } from './i18n/languages';
import { clampRetention, DEFAULT_RETENTION } from './scheduler';

export type Settings = {
  /** FSRS desired retention, 0.80–0.95. The only scheduling setting users see. */
  retention: number;
  /** Show Again/Hard/Good/Easy instead of Forgot/Got it. */
  fourButtons: boolean;
  /** Read the front aloud when a card appears, and the back when it is flipped. */
  readAloud: boolean;
  /** Short answers are typed and checked, and Recap suggests a grade (src/lib/answerCheck.ts). */
  typeAnswer: boolean;
  newPerDay: number;
  reminderEnabled: boolean;
  /** Reminder time as minutes after midnight, local time. */
  reminderMinutes: number;
  /** Home's deck list order. */
  deckSort: DeckSort;
  /** The app's language: the phone's ('auto'), or one picked in Settings. */
  language: LanguageChoice;
  /** Light or dark: the phone's ('auto'), or one picked in Settings › Appearance. */
  appearance: AppearanceChoice;
};

export type DeckSort = 'name' | 'color';

export const DEFAULT_SETTINGS: Settings = {
  retention: DEFAULT_RETENTION,
  // Active recall by default since 1.0.4 (user decision 2026-10-15): type the answer, hear the
  // card, and pick from four grades with one suggested. Also for installs that never changed them.
  fourButtons: true,
  readAloud: true,
  typeAnswer: true,
  newPerDay: 20,
  reminderEnabled: false,
  reminderMinutes: 20 * 60,
  deckSort: 'name',
  language: 'auto',
  appearance: 'auto',
};

export const NEW_PER_DAY_MAX = 200;

/** Database keys (settings table). */
export const SETTING_KEYS = {
  retention: 'target_retention',
  fourButtons: 'four_buttons',
  readAloud: 'read_aloud',
  typeAnswer: 'type_answer',
  newPerDay: 'new_cards_per_day',
  reminderEnabled: 'reminder_enabled',
  reminderMinutes: 'reminder_minutes',
  deckSort: 'deck_sort',
  language: 'app_language',
  appearance: 'app_appearance',
} as const satisfies Record<keyof Settings, string>;

/** Set by versions before 1.0.9 once the welcome decks were made. Nothing makes them since the
 *  app tour (features/tour); kept so an old value stays on this device. */
export const SEEDED_KEY = 'seeded';

/**
 * The "How to use Recap" deck versions 1.0.2 to 1.0.8 made on a new install. Phones that have it
 * keep it: its cards are studied in the order written (every other deck is mixed), and sync
 * leaves it out (db/sync.ts) because each phone made its own.
 */
export const TUTORIAL_DECK_KEY = 'tutorial_deck';

/** Set once the old first-launch tip above that deck was used or skipped (gone since 1.0.9; sync
 *  still sets it when it drops an unused copy of the deck). */
export const TUTORIAL_TIP_DONE_KEY = 'tutorial_tip_done';

/** The tour (features/tour): set once its Home part, or its first-study part, has been finished
 *  or skipped (Skip sets both). Settings › Show the tour again clears them. Per device. */
export const TOUR_HOME_DONE_KEY = 'tour_home_done';
export const TOUR_STUDY_DONE_KEY = 'tour_study_done';

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

/** Set once "Remind you to study?" has been offered after a finished session (asked only once). */
export const REMINDER_OFFERED_KEY = 'reminder_offered';

/** Set once the store's rating sheet has been asked for (features/rating): once per phone. */
export const RATING_ASKED_KEY = 'rating_asked';

/** "Create with AI"'s last Front / Back language (a `CARD_LANGUAGES` code; null = Auto). Per phone. */
export const AI_FRONT_LANGUAGE_KEY = 'ai_front_language';
export const AI_BACK_LANGUAGE_KEY = 'ai_back_language';

/** "A new version is out" (lib/updates.ts): when this phone last read version.json (ms), the
 *  newest version it said, and the version whose notice was hidden with its ✕. Per phone. */
export const UPDATE_CHECKED_KEY = 'update_checked_at';
export const UPDATE_LATEST_KEY = 'update_latest';
export const UPDATE_HIDDEN_KEY = 'update_hidden';

/** Sync's progress on this device (lib/sync/round.ts SyncState) and when it last finished (ms). */
export const SYNC_STATE_KEY = 'sync_state';
export const SYNC_LAST_KEY = 'sync_last_at';
/** Which pictures this device sent to (or got from) the account (lib/sync/pictures.ts). */
export const SYNC_PICTURES_KEY = 'sync_pictures';
/** The leaderboard (lib/leaderboard/score.ts Sent): on it or not, and the score this device last
 *  sent. Forgotten on signing out. */
export const BOARD_SENT_KEY = 'board_sent';
/** The account this device's cards last synced with (db/sync.ts SyncOwner), kept after signing
 *  out, so signing in to another account asks about them first (features/sync/engine.ts). */
export const SYNC_OWNER_KEY = 'sync_owner';

/** This iPhone's App Attest key and whether Recap's server took it (lib/appAttest.ts). Per phone:
 *  the key only works on the iPhone that made it. */
export const APP_ATTEST_KEY = 'app_attest_key';

/** Settings that belong to this device and are left out of backups and sync. */
export const DEVICE_SETTING_KEYS: readonly string[] = [
  SYNC_STATE_KEY,
  SYNC_LAST_KEY,
  SYNC_PICTURES_KEY,
  BOARD_SENT_KEY,
  SYNC_OWNER_KEY,
  SEEDED_KEY,
  TUTORIAL_DECK_KEY,
  TUTORIAL_TIP_DONE_KEY,
  TOUR_HOME_DONE_KEY,
  TOUR_STUDY_DONE_KEY,
  DEVICE_ID_KEY,
  AI_CONSENT_KEY,
  APP_ATTEST_KEY,
  REMINDER_OFFERED_KEY,
  RATING_ASKED_KEY,
  AI_FRONT_LANGUAGE_KEY,
  AI_BACK_LANGUAGE_KEY,
  UPDATE_CHECKED_KEY,
  UPDATE_LATEST_KEY,
  UPDATE_HIDDEN_KEY,
  SETTING_KEYS.reminderEnabled,
  SETTING_KEYS.reminderMinutes,
  // Like the phone's own language and look, choices for this phone.
  SETTING_KEYS.language,
  SETTING_KEYS.appearance,
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
  const typeAnswer = get('typeAnswer');
  const reminderEnabled = get('reminderEnabled');
  const deckSort = get('deckSort');
  const language = get('language');
  const appearance = get('appearance');
  return {
    retention:
      typeof retention === 'number' ? clampRetention(retention) : DEFAULT_SETTINGS.retention,
    fourButtons: typeof fourButtons === 'boolean' ? fourButtons : DEFAULT_SETTINGS.fourButtons,
    readAloud: typeof readAloud === 'boolean' ? readAloud : DEFAULT_SETTINGS.readAloud,
    typeAnswer: typeof typeAnswer === 'boolean' ? typeAnswer : DEFAULT_SETTINGS.typeAnswer,
    newPerDay: int(get('newPerDay'), DEFAULT_SETTINGS.newPerDay, 0, NEW_PER_DAY_MAX),
    reminderEnabled:
      typeof reminderEnabled === 'boolean' ? reminderEnabled : DEFAULT_SETTINGS.reminderEnabled,
    reminderMinutes: int(get('reminderMinutes'), DEFAULT_SETTINGS.reminderMinutes, 0, 24 * 60 - 1),
    deckSort: deckSort === 'color' ? 'color' : 'name',
    // A language this version doesn't have (set by a newer one): the phone's.
    language: isLanguage(language) ? language : 'auto',
    appearance: appearance === 'light' || appearance === 'dark' ? appearance : 'auto',
  };
}
