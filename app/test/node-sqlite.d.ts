// Minimal types for Node's built-in SQLite, used only by tests (test/db.ts, test/fixtures.ts).
// Declared here so the app doesn't need @types/node.
declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;

  export class StatementSync {
    all(...params: SQLInputValue[]): unknown[];
    run(...params: SQLInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    columns(): unknown[];
    setReturnArrays(enabled: boolean): void;
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    /** Replaces the (in-memory) database with the given SQLite file bytes. */
    deserialize(data: Uint8Array): void;
    close(): void;
  }
}
