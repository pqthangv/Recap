/** The website, and the app's web version running locally (Metro, npm run web:preview). */
export const ORIGINS: ReadonlySet<string> = new Set([
  'https://recapflashcards.com',
  'https://www.recapflashcards.com',
  'http://localhost:8081',
  'http://localhost:8090',
]);

/** The app's link scheme: a browser sign-in ends at recapcards://… on a phone. */
export const APP_SCHEME = 'recapcards:';
