import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Test-only values. Google's and Apple's settings are filled in by test/signin.test.ts.
      miniflare: {
        bindings: {
          TOKEN_SECRET: 'test-secret-only-for-the-local-tests-0123',
          DATABASE_URL: 'postgres://not-used-by-the-tests',
          GOOGLE_CLIENT_SECRET: 'test-google-secret',
          APPLE_PRIVATE_KEY: '',
          RESEND_API_KEY: 'test-resend-key',
          EMAIL_KEY: 'test-email-key-only-for-the-local-tests-0123',
          REVIEW_CODE: '246810',
        },
      },
    }),
  ],
});
