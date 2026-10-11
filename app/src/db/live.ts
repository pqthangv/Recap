import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export type TableName = 'decks' | 'cards' | 'review_logs' | 'settings';

/**
 * Re-runs a synchronous query whenever one of `tables` changes, and when the app comes back to
 * the foreground (due counts change with time). Use drizzle's `useLiveQuery` for plain lists from
 * one table; use this for counts and anything that reads several tables.
 * `key` re-runs the query when its inputs change (e.g. a deck id).
 */
export function useLive<T>(compute: () => T, tables: readonly TableName[], key = ''): T {
  const [value, setValue] = useState(compute);
  const latest = useRef(compute);
  useEffect(() => {
    latest.current = compute;
  });

  const watched = tables.join(',');
  useEffect(() => {
    const names = watched.split(',');
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Batches bursts of row changes (an import touches many rows) into one re-run.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setValue(() => latest.current()), 16);
    };
    refresh();
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
  }, [watched, key]);

  return value;
}
