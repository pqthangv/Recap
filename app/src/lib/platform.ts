// What this version of Recap can do. The web version (recapflashcards.com) runs in a browser,
// which can't keep picture files the way the app does, read text in photos (ML Kit), send
// reminders, or open .apkg decks yet, so those buttons are hidden there.
import { Platform } from 'react-native';

const onWeb = Platform.OS === 'web';

export const can = {
  /** Pictures on cards (take, choose, show, import from .apkg). */
  pictures: !onWeb,
  /** The "Photo" tab in Create with AI. */
  photoText: !onWeb,
  /** Daily and streak reminders. */
  reminders: !onWeb,
  /** Importing .apkg decks. */
  apkgImport: !onWeb,
  /** "A new version is out" on Home: the website is always the newest version. */
  updateNotice: !onWeb,
};

/** Running as the website rather than the phone app. */
export const isWeb = onWeb;
