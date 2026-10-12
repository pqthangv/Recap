import { useIsFocused } from 'expo-router';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export type TableName = 'decks' | 'cards' | 'review_logs' | 'settings';

/**
 * Re-runs a synchronous query whenever one of `tables` changes, and when the app comes back to
 * the foreground (due counts change with time). `key` re-runs it when its inputs change (e.g. a
 * deck id).
 *
 * Screens under another screen (Home and the deck while you study) don't re-run on every change:
 * they wait until they're shown again and re-run once. With a 10,000-card deck, re-running them
 * after each answer froze studying for over half a second.
 */
export function useLive<T>(compute: () => T, tables: readonly TableName[], key = ''): T {
  const [value, setValue] = useState(compute);
  const latest = useRef(compute);
  useEffect(() => {
    latest.current = compute;
  });
  const focused = useIsFocused();
  // The first render already computed the value, so the first subscription doesn't re-run it.
  const fresh = useRef(true);

  const watched = tables.join(',');
  useEffect(() => {
    if (!focused) {
      fresh.current = false; // re-run when shown
      return;
    }
    const names = watched.split(',');
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Batches bursts of row changes (an import touches many rows) into one re-run.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setValue(() => latest.current()), 16);
    };
    if (fresh.current) fresh.current = false;
    else refresh(); // shown again, or `key` changed
    const dbSub = addDatabaseChangeListener(({ tableName }) => {
      if (names.includes(tableName)) refresh();
    });
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      dbSub.remove();
      appSub.remove();
    };
  }, [watched, key, focused]);

  return value;
}
