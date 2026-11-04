// The website keeps the signed-in account in the browser's localStorage, next to the cards.
const KEY = 'recap_sync_account';

export const accountStorage = {
  read(): string | null {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  write(value: string): void {
    try {
      window.localStorage.setItem(KEY, value);
    } catch (e) {
      console.warn('Could not keep the sign-in', e);
    }
  },
  async remove(): Promise<void> {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // Nothing kept.
    }
  },
};
