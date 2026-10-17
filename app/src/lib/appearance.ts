// Light or dark. By default Recap follows the phone (or the browser); Settings › Appearance can
// pick one instead (per phone, like the language; not in backups).
import { useSyncExternalStore } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

export type Scheme = 'light' | 'dark';

/** Settings › Appearance: a look, or 'auto' to follow the phone. */
export type AppearanceChoice = Scheme | 'auto';

let choice: AppearanceChoice = 'auto';
const listeners = new Set<() => void>();

/** Applies Settings › Appearance (read from the database at start, and when it's changed). */
export function setAppearanceChoice(next: AppearanceChoice): void {
  // The phone's own parts follow too: alerts, keyboards, pickers, the system bars. The web has no
  // such switch, and everything there is drawn by Recap anyway.
  if (Platform.OS !== 'web') Appearance.setColorScheme(next === 'auto' ? 'unspecified' : next);
  if (next === choice) return;
  choice = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getChoice = () => choice;

/** The look to draw now. Screens redraw in place when it changes (nothing typed is lost). */
export function useScheme(): Scheme {
  const phone = useColorScheme();
  const picked = useSyncExternalStore(subscribe, getChoice, getChoice);
  if (picked !== 'auto') return picked;
  return phone === 'dark' ? 'dark' : 'light';
}
