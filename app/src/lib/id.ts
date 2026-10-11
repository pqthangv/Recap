import { uuid } from 'expo-modules-core';

/** A random UUID v4 for a new row (generated natively, so it's safe to sync later). */
export function newId(): string {
  return uuid.v4();
}
