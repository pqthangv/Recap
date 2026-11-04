// Accounts, in Neon (roadmap 6.1): which Google, Apple or email sign-in each account belongs to, and
// the devices that signed in to it. Only signing in comes here; a normal sync never wakes Neon,
// because the Worker checks its own tokens (src/auth.ts). The tables are in schema.sql.
import { neon } from '@neondatabase/serverless';

export type Provider = 'google' | 'apple' | 'email';

/** Who signed in: Google's or Apple's id for the person, or the email address's HMAC. */
export type Identity = { provider: Provider; subject: string };

export interface Accounts {
  /** The identity's account (made on its first sign-in), with this device recorded. */
  signIn(identity: Identity, device: string): Promise<{ id: string; created: boolean }>;
}

export function neonAccounts(databaseUrl: string): Accounts {
  return {
    async signIn({ provider, subject }, device) {
      const sql = neon(databaseUrl);
      const id = crypto.randomUUID();
      // One round trip: make the account or find it (the no-op update makes RETURNING give the
      // existing row too), then record the device.
      const rows = await sql`
        with account as (
          insert into accounts (id, provider, subject) values (${id}, ${provider}, ${subject})
          on conflict (provider, subject) do update set provider = excluded.provider
          returning id
        )
        insert into account_devices (account_id, device_id)
        select id, ${device} from account
        on conflict (account_id, device_id) do update set signed_in_at = now()
        returning account_id`;
      const account = String(rows[0]!.account_id);
      return { id: account, created: account === id };
    },
  };
}
