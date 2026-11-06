// An account's sync files in memory, like R2 behind the sync Worker: create-only names, and a head
// swapped only if it's unchanged. For tests of sync on the real test database.
import { parseBackup } from '@/lib/backup';
import type { Head } from '@/lib/sync/files';
import type { SyncStore } from '@/lib/sync/round';

export class MemoryStore implements SyncStore {
  files = new Map<string, string>();
  head: Head | null = null;

  /** `now`: the server's clock, as the Worker reports it with each listing. */
  constructor(private readonly now: () => number = Date.now) {}

  async list() {
    return { head: this.head, names: [...this.files.keys()].sort(), now: this.now() };
  }
  async read(name: string) {
    return this.files.get(name) ?? null;
  }
  async create(name: string, text: string) {
    if (this.files.has(name)) return false;
    this.files.set(name, text);
    return true;
  }
  async swapHead(base: number | null, head: Head) {
    if ((this.head?.base ?? null) !== base) return false;
    this.head = head;
    return true;
  }
  async remove(names: readonly string[]) {
    for (const name of names) this.files.delete(name);
  }
  /** Every row sent so far, from all change files. */
  sent() {
    const backups = [...this.files.values()].map((text) => parseBackup(text));
    return {
      decks: backups.flatMap((b) => b.decks),
      cards: backups.flatMap((b) => b.cards),
      review_logs: backups.flatMap((b) => b.review_logs),
      settings: backups.flatMap((b) => b.settings),
    };
  }
}
