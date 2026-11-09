// Demo data for store screenshots and performance checks, made with the app's own scheduler.
// Used by scripts/demo-backup.test.ts (a backup file to import on a phone) and
// scripts/demo-db.test.ts (a ready-made database for the iPhone simulator).
import { randomUUID } from 'crypto';

import { buildBackup } from '@/lib/backup';
import { dayStart } from '@/lib/day';
import type { Language } from '@/lib/i18n/languages';
import type { SideLanguages } from '@/lib/language';
import { newCard, Rating, review, type FsrsFields } from '@/lib/scheduler';

const DAY = 24 * 60 * 60 * 1000;

const DECKS: {
  name: string;
  /** In another app language's store pictures, if it differs: its name, and words with that
   *  language's meanings (the typed-answer deck). */
  inLanguage?: Partial<
    Record<Language, { name: string; languages?: SideLanguages; cards?: [string, string][] }>
  >;
  color: string;
  languages?: SideLanguages;
  /** Only the first card is due today, so studying the deck always opens on it (screenshots). */
  firstCardDueOnly?: boolean;
  cards: [string, string][];
}[] = [
  {
    name: 'Languages › Spanish basics',
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
    name: 'Exam prep › IELTS vocabulary',
    color: '#5A31D6',
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
    name: 'Exam prep › SAT words',
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
  // 1.0.8: more decks, so Home fills an iPad too, in a few subject groups with one color each
  // (sciences green, humanities orange, languages blue, exams violet, math and economics red,
  // arts and psychology magenta, programming grey).
  {
    name: 'Chemistry › Elements',
    color: '#0B8043',
    cards: [
      ['Chemical symbol for gold', 'Au'],
      ['Chemical symbol for sodium', 'Na'],
      ['Chemical symbol for iron', 'Fe'],
      ['Chemical symbol for potassium', 'K'],
      ['Atomic number of carbon', '6'],
      ['The lightest element', 'Hydrogen'],
      ['The most common gas in the air', 'Nitrogen'],
      ['A metal that is liquid at room temperature', 'Mercury'],
    ],
  },
  {
    name: 'Chemistry › Reactions',
    color: '#0B8043',
    cards: [
      ['What does a catalyst do?', 'Speeds up a reaction without being used up'],
      ['Acid + base gives…', 'A salt and water'],
      ['pH of pure water', '7'],
      ['Rusting is a reaction of iron with…', 'Oxygen and water'],
      ['A reaction that gives out heat', 'Exothermic'],
      ['A reaction that takes in heat', 'Endothermic'],
      ['What burning needs besides fuel and heat', 'Oxygen'],
      ['Formula of water', 'H₂O'],
    ],
  },
  {
    name: 'History › Ancient world',
    color: '#E37400',
    cards: [
      ['Where were the pyramids of Giza built?', 'Egypt'],
      ['Which city was the center of the Roman Empire?', 'Rome'],
      ['Where did the first Olympic Games take place?', 'Olympia, Greece'],
      ['What writing did the ancient Egyptians use?', 'Hieroglyphs'],
      ['Which river was Mesopotamia built around?', 'The Tigris and the Euphrates'],
      ['Which empire built Machu Picchu?', 'The Inca Empire'],
      ['Which wall was built to protect China?', 'The Great Wall'],
      ['Which city was buried by Mount Vesuvius?', 'Pompeii'],
    ],
  },
  {
    name: 'History › Modern history',
    color: '#E37400',
    cards: [
      ['In which country did the Industrial Revolution begin?', 'Britain'],
      ['In which year did the Berlin Wall fall?', '1989'],
      ['Who was the first person to walk on the Moon?', 'Neil Armstrong (1969)'],
      ['In which year did the United Nations begin?', '1945'],
      ['Who got the first telephone patent (1876)?', 'Alexander Graham Bell'],
      ['Who wrote On the Origin of Species (1859)?', 'Charles Darwin'],
      ['Who first flew a powered airplane (1903)?', 'The Wright brothers'],
      ['In which year did the French Revolution begin?', '1789'],
    ],
  },
  {
    name: 'Languages › French phrases',
    color: '#1A73E8',
    languages: { front: 'fr', back: 'en' },
    cards: [
      ['bonjour', 'hello'],
      ['merci beaucoup', 'thank you very much'],
      ['s’il vous plaît', 'please'],
      ['je ne comprends pas', 'I don’t understand'],
      ['où est la gare ?', 'where is the station?'],
      ['l’addition, s’il vous plaît', 'the bill, please'],
      ['à bientôt', 'see you soon'],
      ['combien ça coûte ?', 'how much does it cost?'],
    ],
  },
  {
    name: 'Math › Algebra',
    color: '#C5221F',
    cards: [
      ['Solve $2x + 3 = 11$', '$x = 4$'],
      ['Expand $(a + b)^2$', '$a^2 + 2ab + b^2$'],
      ['Solve $ax^2 + bx + c = 0$', '$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$'],
      ['$x^a \\cdot x^b$ equals', '$x^{a+b}$'],
      ['Factor $x^2 - 9$', '$(x - 3)(x + 3)$'],
      ['Slope of $y = 3x - 2$', '$3$'],
      ['$\\sqrt{144}$', '$12$'],
      ['$2^{10}$', '$1024$'],
    ],
  },
  {
    name: 'Math › Geometry',
    color: '#C5221F',
    cards: [
      ['Area of a circle', '$\\pi r^2$'],
      ['Circumference of a circle', '$2\\pi r$'],
      ['Pythagoras: right triangle with legs $a$, $b$', '$c^2 = a^2 + b^2$'],
      ['Angles in a triangle add up to', '180°'],
      ['Area of a triangle', '$\\frac{1}{2} \\times$ base $\\times$ height'],
      ['Volume of a cube with side $a$', '$a^3$'],
      ['Angles in a square add up to', '360°'],
      ['Volume of a sphere', '$\\frac{4}{3}\\pi r^3$'],
    ],
  },
  {
    name: 'Music theory',
    color: '#AD1457',
    cards: [
      ['How many lines does a staff have?', 'Five'],
      ['How many beats is a whole note in 4/4?', 'Four'],
      ['Notes of a C major chord', 'C, E and G'],
      ['What does "forte" mean?', 'Play loudly'],
      ['What does "piano" mean as a dynamic?', 'Play softly'],
      ['How many semitones are in an octave?', '12'],
      ['Which clef is used for low notes?', 'The bass clef'],
      ['What does a sharp (♯) do?', 'Raises a note by a semitone'],
    ],
  },
  {
    name: 'Physics',
    color: '#0B8043',
    cards: [
      ['Newton’s second law', '$F = ma$'],
      ['Speed of light (about)', '300,000 km per second'],
      ['Unit of force', 'The newton (N)'],
      ['Unit of electrical resistance', 'The ohm (Ω)'],
      ['Ohm’s law', '$V = IR$'],
      ['What pulls objects toward Earth?', 'Gravity'],
      ['Energy of motion is called…', 'Kinetic energy'],
      ['Einstein’s mass–energy formula', '$E = mc^2$'],
    ],
  },
  {
    name: 'Programming › Python basics',
    color: '#5F6368',
    cards: [
      ['Print text in Python', 'print("hello")'],
      ['Make a list of 1, 2 and 3', '[1, 2, 3]'],
      ['Number of items in a list', 'len(items)'],
      ['Loop over a list', 'for item in items:'],
      ['Start a function', 'def name():'],
      ['Check a condition', 'if x > 0:'],
      ['Turn "42" into a number', 'int("42")'],
      ['A comment starts with…', '#'],
    ],
  },
  {
    name: 'Programming › JavaScript basics',
    color: '#5F6368',
    cards: [
      ['Print to the console', 'console.log("hello")'],
      ['A value that can’t be reassigned', 'const x = 1;'],
      ['Number of items in an array', 'items.length'],
      ['Strict equality', '==='],
      ['Arrow function that doubles x', 'x => x * 2'],
      ['Turn "42" into a number', 'Number("42")'],
      ['Add an item to the end of an array', 'items.push(item)'],
      ['A one-line comment starts with…', '//'],
    ],
  },
  // 1.0.8, for the iPad's taller Home: five more rows (Medicine is a group of two).
  {
    name: 'Art history',
    color: '#AD1457',
    cards: [
      ['Who painted the Mona Lisa?', 'Leonardo da Vinci'],
      ['Who painted The Starry Night?', 'Vincent van Gogh'],
      ['Who carved the statue of David (1504)?', 'Michelangelo'],
      ['Who painted Guernica?', 'Pablo Picasso'],
      ['Monet’s art movement', 'Impressionism'],
      ['Who painted The Persistence of Memory?', 'Salvador Dalí'],
      ['Who painted Girl with a Pearl Earring?', 'Johannes Vermeer'],
      ['Who painted The Scream?', 'Edvard Munch'],
    ],
  },
  {
    name: 'Economics',
    color: '#C5221F',
    cards: [
      ['What is inflation?', 'Prices rising over time'],
      ['GDP stands for…', 'Gross domestic product'],
      ['When prices go up, demand usually…', 'Falls'],
      ['A market with only one seller', 'A monopoly'],
      ['What you give up when you choose something', 'The opportunity cost'],
      ['A tax on imported goods', 'A tariff'],
      ['Two quarters in a row of a shrinking economy', 'A recession'],
      ['The central bank of the United States', 'The Federal Reserve'],
    ],
  },
  {
    name: 'Geography',
    color: '#E37400',
    cards: [
      ['The largest ocean', 'The Pacific'],
      ['The highest mountain above sea level', 'Mount Everest'],
      ['The largest hot desert', 'The Sahara'],
      ['How many continents are there?', 'Seven'],
      ['The largest country by area', 'Russia'],
      ['The smallest country', 'Vatican City'],
      ['The largest island', 'Greenland'],
      ['The line between the Northern and Southern Hemispheres', 'The equator'],
    ],
  },
  {
    name: 'Medicine › Anatomy',
    color: '#0B8043',
    cards: [
      ['The body’s largest organ', 'The skin'],
      ['Bones in an adult body', '206'],
      ['The longest bone', 'The femur (thigh bone)'],
      ['The smallest bone', 'The stapes, in the ear'],
      ['What pumps blood around the body', 'The heart'],
      ['What filters the blood to make urine', 'The kidneys'],
      ['Where most digestion happens', 'The small intestine'],
      ['What carries oxygen in the blood', 'Red blood cells'],
    ],
  },
  {
    name: 'Medicine › Medical terms',
    color: '#0B8043',
    cards: [
      ['cardio-', 'heart'],
      ['hepat-', 'liver'],
      ['nephr-', 'kidney'],
      ['derm-', 'skin'],
      ['-itis', 'inflammation'],
      ['-ectomy', 'surgical removal'],
      ['tachy-', 'fast'],
      ['brady-', 'slow'],
    ],
  },
  {
    name: 'Psychology',
    color: '#AD1457',
    cards: [
      ['The founder of psychoanalysis', 'Sigmund Freud'],
      ['What Pavlov’s dogs showed', 'Classical conditioning'],
      ['Learning from rewards and punishments', 'Operant conditioning'],
      ['Maslow’s pyramid is about…', 'Human needs'],
      ['Looking only for proof of what you already believe', 'Confirmation bias'],
      ['The brain area key to forming new memories', 'The hippocampus'],
      ['Who described the stages of child development?', 'Jean Piaget'],
      ['Miller’s “magical number” for short-term memory', '7, plus or minus 2'],
    ],
  },
  // Last, so the decks above keep the same random history (every language's version has 8
  // cards). The typed-answer screenshot studies it: the first card is the one due, and its answer
  // typed without the accents ("qua tao" for "quả táo") gets "Almost: check the accents" with Hard
  // suggested. English words with Vietnamese meanings: "Vietnamese words" in the English pictures,
  // "English words" in the others, with that language's meanings (the .maestro flows type the
  // answer). Hindi and Bengali cards ask for the English word, typed "aple": "Almost: check the
  // spelling" (Recap's accent check is for Latin letters).
  {
    name: 'Languages › Vietnamese words',
    inLanguage: {
      vi: { name: 'Languages › English words' },
      es: {
        name: 'Languages › English words',
        languages: { front: 'en', back: 'es' },
        cards: [
          ['lemon', 'limón'],
          ['apple', 'manzana'],
          ['bread', 'pan'],
          ['cheese', 'queso'],
          ['milk', 'leche'],
          ['water', 'agua'],
          ['coffee', 'café'],
          ['rice', 'arroz'],
        ],
      },
      fr: {
        name: 'Languages › English words',
        languages: { front: 'en', back: 'fr' },
        cards: [
          ['coffee', 'café'],
          ['apple', 'pomme'],
          ['bread', 'pain'],
          ['cheese', 'fromage'],
          ['milk', 'lait'],
          ['water', 'eau'],
          ['tea', 'thé'],
          ['rice', 'riz'],
        ],
      },
      pt: {
        name: 'Languages › English words',
        languages: { front: 'en', back: 'pt' },
        cards: [
          ['apple', 'maçã'],
          ['bread', 'pão'],
          ['cheese', 'queijo'],
          ['milk', 'leite'],
          ['water', 'água'],
          ['coffee', 'café'],
          ['rice', 'arroz'],
          ['egg', 'ovo'],
        ],
      },
      hi: {
        name: 'Languages › English words',
        languages: { front: 'hi', back: 'en' },
        cards: [
          ['सेब', 'apple'],
          ['रोटी', 'bread'],
          ['पनीर', 'cheese'],
          ['दूध', 'milk'],
          ['पानी', 'water'],
          ['कॉफ़ी', 'coffee'],
          ['चावल', 'rice'],
          ['अंडा', 'egg'],
        ],
      },
      bn: {
        name: 'Languages › English words',
        languages: { front: 'bn', back: 'en' },
        cards: [
          ['আপেল', 'apple'],
          ['রুটি', 'bread'],
          ['পনির', 'cheese'],
          ['দুধ', 'milk'],
          ['পানি', 'water'],
          ['কফি', 'coffee'],
          ['ভাত', 'rice'],
          ['ডিম', 'egg'],
        ],
      },
    },
    color: '#1A73E8',
    languages: { front: 'en', back: 'vi' },
    firstCardDueOnly: true,
    cards: [
      ['apple', 'quả táo'],
      ['bread', 'bánh mì'],
      ['cheese', 'phô mai'],
      ['milk', 'sữa'],
      ['water', 'nước'],
      ['coffee', 'cà phê'],
      ['rice', 'cơm'],
      ['egg', 'trứng'],
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

/** `language`: the app's language in the store pictures (only the typed-answer deck changes). */
export function makeDemo(now: number, language: Language = 'en') {
  const rnd = random(42);
  // Study days start at 4 AM (lib/day.ts), so "today" is the study day, not the calendar day.
  const today = dayStart(now);
  const decks = [];
  const cards = [];
  const logs = [];
  for (const [d, spec] of DECKS.entries()) {
    const deckId = randomUUID();
    const created = today - (16 + d) * DAY;
    const own = spec.inLanguage?.[language];
    const languages = own?.languages ?? spec.languages;
    decks.push({
      id: deckId,
      name: own?.name ?? spec.name,
      color: spec.color,
      front_lang: languages?.front ?? null,
      back_lang: languages?.back ?? null,
      created_at: created,
      updated_at: created,
      deleted_at: null,
    });
    for (const [i, [front, back]] of (own?.cards ?? spec.cards).entries()) {
      const id = randomUUID();
      const cardCreated = created + i * 1000;
      let fields: FsrsFields = newCard(cardCreated);
      if (spec.firstCardDueOnly) {
        // Two good reviews last week; then the first card is due an hour ago and the rest later.
        for (const daysAgo of [6, 5]) {
          const at = today - daysAgo * DAY + 16 * 60 * 60 * 1000;
          const result = review({ ...fields, id }, Rating.Good, at, 0.95);
          fields = result.card;
          logs.push({
            id: randomUUID(),
            card_id: id,
            ...result.log,
            duration_ms: 9000,
            goal_met: 1,
            deleted_at: null,
          });
        }
        fields = { ...fields, due: i === 0 ? now - 60 * 60 * 1000 : today + (2 + i) * DAY };
      }
      // About a quarter of each deck is still new; the rest started on one of the last 15 days.
      const start = spec.firstCardDueOnly
        ? Infinity
        : rnd() < 0.25
          ? Infinity
          : 15 - Math.floor(rnd() * 15);
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
