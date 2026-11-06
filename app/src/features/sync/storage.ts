// Where the signed-in account is kept on a phone: the Keychain (iPhone) or the Keystore (Android),
// via expo-secure-store. Its plugin keeps it out of Android's cloud backups, so a phone restored
// from a backup signs in again.
import * as SecureStore from 'expo-secure-store';

const KEY = 'sync_account';

export const accountStorage = {
  read: (): string | null => SecureStore.getItem(KEY),
  write: (value: string): void => SecureStore.setItem(KEY, value),
  remove: (): Promise<void> => SecureStore.deleteItemAsync(KEY),
};
