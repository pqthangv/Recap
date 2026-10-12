// Demo data for store screenshots: a Recap backup with nicely named decks and two weeks of real
// study history (made with the app's own scheduler), so Home, Study and Stats look lived-in.
//
//   MAKE_DEMO_BACKUP=path/to/recap-demo-backup.json npx jest scripts/demo-backup
//
// Also a 10,000-card deck for checking the app stays fast (roadmap 5.3):
//
//   MAKE_BIG_BACKUP=path/to/recap-10k-backup.json npx jest scripts/demo-backup
//
// Then on the phone: Settings › Advanced › Import backup. Skipped in normal `npm test` runs.
import { makeBig, makeDemo } from './demo-data';

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
/* eslint-enable @typescript-eslint/no-require-imports */

const OUT = process.env.MAKE_DEMO_BACKUP;
const BIG_OUT = process.env.MAKE_BIG_BACKUP;

(OUT ? it : it.skip)('writes the demo backup', () => {
  const backup = makeDemo(Date.now());
  fs.writeFileSync(OUT, JSON.stringify(backup));
  console.log(
    `${backup.decks.length} decks, ${backup.cards.length} cards, ${backup.review_logs.length} reviews → ${OUT}`,
  );
  expect(backup.cards.length).toBeGreaterThan(50);
});

(BIG_OUT ? it : it.skip)('writes the 10,000-card backup', () => {
  const now = Date.now();
  const backup = makeBig(now);
  fs.writeFileSync(BIG_OUT, JSON.stringify(backup));
  const due = backup.cards.filter((c) => c.due <= now && c.state !== 0).length;
  console.log(`${backup.cards.length} cards (${due} due), ${backup.review_logs.length} reviews`);
  expect(backup.cards.length).toBe(10_000);
});
