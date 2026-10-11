import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` writes SQL migrations to ./drizzle, then scripts/bundle-migrations.js
// inlines them into src/db/migrations.ts so Metro and jest can load them without a .sql loader.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
