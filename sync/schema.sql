-- The sync Worker's Neon database (roadmap 6.1, src/accounts.ts). Run once in the Neon console's
-- SQL Editor, in sync's own project (not the AI server's). Running it again changes nothing.

-- One row per sign-in: Google's or Apple's id for the person, or the email address's HMAC (the
-- address itself is never stored). The id is the account's folder in R2 and its tokens' subject.
create table if not exists accounts (
  id uuid primary key,
  provider text not null check (provider in ('google', 'apple', 'email')),
  subject text not null,
  created_at timestamptz not null default now(),
  unique (provider, subject)
);

-- The installs that signed in to each account (the app's random install id).
create table if not exists account_devices (
  account_id uuid not null references accounts (id) on delete cascade,
  device_id uuid not null,
  added_at timestamptz not null default now(),
  signed_in_at timestamptz not null default now(),
  primary key (account_id, device_id)
);
