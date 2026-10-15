// Demo data for store screenshots and performance checks, made with the app's own scheduler.
// Used by scripts/demo-backup.test.ts (a backup file to import on a phone) and
// scripts/demo-db.test.ts (a ready-made database for the iPhone simulator).
import { randomUUID } from 'crypto';

import { buildBackup } from '@/lib/backup';
import { dayStart } from '@/lib/day';
import type { SideLanguages } from '@/lib/language';
import { newCard, Rating, review, type FsrsFields } from '@/lib/scheduler';

const DAY = 24 * 60 * 60 * 1000;

const DECKS: {
  name: string;
  color: string;
  languages?: SideLanguages;
  cards: [string, string][];
}[] = [
  {
    name: 'Spanish basics',
    color: '#1A73E8',
    languages: { front: 'es', back: 'en' },
    cards: [
      ['hola', 'hello'],
      ['gracias', 'thank you'],
      ['por favor', 'please'],
      ['la casa', 'the house'],
      ['el perro', 'the dog'],
      ['el gato', 'the cat'],
      ['el agua', 'the water'],
      ['la comida', 'the food'],
      ['buenos días', 'good morning'],
      ['buenas noches', 'good night'],
      ['¿Cómo estás?', 'How are you?'],
      ['la biblioteca', 'the library'],
      ['el libro', 'the book'],
      ['la escuela', 'the school'],
      ['el amigo', 'the friend'],
      ['hablar', 'to speak'],
      ['comer', 'to eat'],
      ['vivir', 'to live'],
      ['aprender', 'to learn'],
      ['mañana', 'tomorrow'],
      ['ayer', 'yesterday'],
      ['siempre', 'always'],
    ],
  },
  {
    name: 'Biology › Cells',
    color: '#0B8043',
    cards: [
      ['What do mitochondria make?', 'ATP, the cell’s energy'],
      ['What do ribosomes build?', 'Proteins'],
      ['Where is a cell’s DNA stored?', 'In the nucleus'],
      ['What do chloroplasts do?', 'Photosynthesis'],
      ['What controls what enters and leaves a cell?', 'The cell membrane'],
      ['What is the jelly-like fluid inside a cell?', 'Cytoplasm'],
      ['Which organelle packages proteins?', 'The Golgi apparatus'],
      ['What gives plant cells their shape?', 'The cell wall'],
      ['Prokaryote or eukaryote: bacteria?', 'Prokaryote (no nucleus)'],
      ['What is osmosis?', 'Water moving across a membrane'],
    ],
  },
  {
    name: 'Biology › Genetics',
    color: '#0B8043',
    cards: [
      ['What does DNA stand for?', 'Deoxyribonucleic acid'],
      ['What is a gene?', 'A section of DNA that codes for a protein'],
      ['How many chromosomes do humans have?', '46 (23 pairs)'],
      ['What is an allele?', 'A version of a gene'],
      ['Dominant or recessive: shows with one copy?', 'Dominant'],
      ['What is a mutation?', 'A change in the DNA sequence'],
      ['Which base pairs with adenine?', 'Thymine'],
      ['What is meiosis for?', 'Making sex cells'],
    ],
  },
  {
    name: 'Capital cities',
    color: '#E37400',
    cards: [
      ['Japan', 'Tokyo'],
      ['Vietnam', 'Hanoi'],
      ['Canada', 'Ottawa'],
      ['Australia', 'Canberra'],
      ['Brazil', 'Brasília'],
      ['Kenya', 'Nairobi'],
      ['Egypt', 'Cairo'],
      ['Germany', 'Berlin'],
      ['Peru', 'Lima'],
      ['New Zealand', 'Wellington'],
      ['Thailand', 'Bangkok'],
      ['Norway', 'Oslo'],
      ['Morocco', 'Rabat'],
      ['Argentina', 'Buenos Aires'],
      ['South Korea', 'Seoul'],
      ['Turkey', 'Ankara'],
    ],
  },
  {
    name: 'IELTS vocabulary',
    color: '#AD1457',
    cards: [
      ['alleviate', 'to make a problem or pain less severe'],
      ['substantial', 'large in amount or importance'],
      ['inevitable', 'certain to happen'],
      ['detrimental', 'causing harm or damage'],
      ['prevalent', 'common; widespread'],
      ['fluctuate', 'to rise and fall irregularly'],
      ['coherent', 'logical and well organised'],
      ['feasible', 'possible and practical to do'],
      ['sustainable', 'able to continue without causing damage'],
      ['deteriorate', 'to become worse'],
      ['advocate', 'to publicly support an idea'],
      ['compulsory', 'required by a law or rule'],
      ['pros and cons', 'advantages and disadvantages'],
      ['to some extent', 'partly, but not completely'],
    ],
  },
  {
    name: 'SAT words',
    color: '#5A31D6',
    cards: [
      ['ubiquitous', 'found everywhere'],
      ['ephemeral', 'lasting a very short time'],
      ['laconic', 'using very few words'],
      ['benevolent', 'kind and generous'],
      ['candid', 'truthful and straightforward'],
      ['diligent', 'hard-working and careful'],
      ['meticulous', 'very careful about details'],
      ['pragmatic', 'dealing with things practically'],
      ['resilient', 'able to recover quickly'],
      ['scrutinize', 'to examine closely'],
      ['verbose', 'using more words than needed'],
      ['zealous', 'full of energy for a cause'],
      ['ambiguous', 'having more than one meaning'],
      ['tenacious', 'holding firmly; persistent'],
    ],
  },
];

/** Small seeded random numbers, so the same demo comes out every time. */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function makeDemo(now: number) {
  const rnd = random(42);
  // Study days start at 4 AM (lib/day.ts), so "today" is the study day, not the calendar day.
  const today = dayStart(now);
  const decks = [];
  const cards = [];
  const logs = [];
  for (const [d, spec] of DECKS.entries()) {
    const deckId = randomUUID();
    const created = today - (16 + d) * DAY;
    decks.push({
      id: deckId,
      name: spec.name,
      color: spec.color,
      front_lang: spec.languages?.front ?? null,
      back_lang: spec.languages?.back ?? null,
      created_at: created,
      updated_at: created,
      deleted_at: null,
    });
    for (const [i, [front, back]] of spec.cards.entries()) {
      const id = randomUUID();
      const cardCreated = created + i * 1000;
      let fields: FsrsFields = newCard(cardCreated);
      // About a quarter of each deck is still new; the rest started on one of the last 15 days.
      const start = rnd() < 0.25 ? Infinity : 15 - Math.floor(rnd() * 15);
      for (let daysAgo = Math.min(start, 15); daysAgo >= 0 && start !== Infinity; daysAgo--) {
        // Study around 8 pm each day (16 h after the 4 AM start). Today: in the last two hours,
        // but not before today's study day began, so "reviewed today" isn't empty.
        const at =
          daysAgo === 0
            ? Math.max(
                today + 60_000,
                now - 2 * 60 * 60 * 1000 - Math.floor(rnd() * 30 * 60 * 1000),
              )
            : today - daysAgo * DAY + 16 * 60 * 60 * 1000 + Math.floor(rnd() * 3600 * 1000);
        if (daysAgo !== start && fields.due > at) continue; // not due that day
        if (daysAgo === 0 && rnd() < 0.5) continue; // leave some of today's cards due
        const rating = rnd() < 0.82 ? Rating.Good : Rating.Again;
        const result = review({ ...fields, id }, rating, at, 0.95);
        fields = result.card;
        logs.push({
          id: randomUUID(),
          card_id: id,
          ...result.log,
          duration_ms: 8000 + Math.floor(rnd() * 17000), // 8–25 s, thinking included
          // The demo met its new-card goal every day before today; today's is still to do.
          goal_met: daysAgo > 0 ? 1 : 0,
          deleted_at: null,
        });
      }
      cards.push({
        id,
        deck_id: deckId,
        front,
        back,
        image_uri: null,
        image_side: null,
        tags: [],
        reverse_of: null,
        ...fields,
        created_at: cardCreated,
        updated_at: Math.max(cardCreated, fields.last_review ?? 0),
        deleted_at: null,
      });
    }
  }
  return buildBackup({ decks, cards, review_logs: logs, settings: [] }, now);
}

/** One deck of 10,000 cards: a fifth new, the rest studied 1–3 times in the last two months, so
 * a good share is due today. */
export function makeBig(now: number, size = 10_000) {
  const rnd = random(7);
  const deckId = randomUUID();
  const created = now - 60 * DAY;
  const cards = [];
  const logs = [];
  for (let i = 0; i < size; i++) {
    const id = randomUUID();
    const cardCreated = created + i;
    let fields: FsrsFields = newCard(cardCreated);
    if (rnd() > 0.2) {
      const reviews = 1 + Math.floor(rnd() * 3);
      let at = now - Math.floor((10 + rnd() * 50) * DAY);
      for (let r = 0; r < reviews && at < now; r++) {
        const result = review(
          { ...fields, id },
          rnd() < 0.85 ? Rating.Good : Rating.Again,
          at,
          0.95,
        );
        fields = result.card;
        logs.push({
          id: randomUUID(),
          card_id: id,
          ...result.log,
          duration_ms: 5000,
          goal_met: 0,
          deleted_at: null,
        });
        at = Math.max(fields.due, at + 60_000);
      }
    }
    cards.push({
      id,
      deck_id: deckId,
      front: `Word ${i + 1}`,
      back: `Meaning of word ${i + 1}, with a longer answer to look like a real card.`,
      image_uri: null,
      image_side: null,
      tags: [],
      reverse_of: null,
      ...fields,
      created_at: cardCreated,
      updated_at: Math.max(cardCreated, fields.last_review ?? 0),
      deleted_at: null,
    });
  }
  const deck = {
    id: deckId,
    name: '10,000 cards',
    color: '#5F6368',
    front_lang: null,
    back_lang: null,
    created_at: created,
    updated_at: created,
    deleted_at: null,
  };
  return buildBackup({ decks: [deck], cards, review_logs: logs, settings: [] }, now);
}
