// Store screenshots only: a made-up leaderboard, for the app built with EXPO_PUBLIC_DEMO_BOARD=1
// (features/leaderboard/api.ts; only the screenshot job sets it). The people are made up and
// nothing is sent anywhere; "me" is this phone's own score (the demo decks' streak). Ranked like
// sync/src/board.ts: by one score, then the other; equal scores share a rank (1, 2, 2, 4).
// The names suit each app language's store listing (user, 2026-11-09): India for Hindi (mostly in
// its own letters, a few in Latin ones, like a real board), Bangladesh for Bengali, Spain and
// Latin America for Spanish, France, Brazil, Vietnam; English keeps an international mix. The
// scores and who "me" follows are the same in every language.
import { type Language, language } from '@/lib/i18n';

import type { Profile, Ranking, Row, Tab, View } from './client';

type DemoPerson = {
  displayName: string;
  username: string;
  streak: number;
  weekCards: number;
  following?: true;
};

/** Display name and username. */
type Name = readonly [string, string];
type DemoNames = { people: readonly Name[]; me: Name };

/** The made-up people's scores, top of the streak board first; their names are DEMO_NAMES. */
const SCORES: readonly Omit<DemoPerson, 'displayName' | 'username'>[] = [
  { streak: 132, weekCards: 412 },
  { streak: 97, weekCards: 318 },
  { streak: 64, weekCards: 287 },
  { streak: 41, weekCards: 254 },
  { streak: 28, weekCards: 233 },
  { streak: 19, weekCards: 201, following: true },
  { streak: 12, weekCards: 176, following: true },
  { streak: 9, weekCards: 148 },
  { streak: 8, weekCards: 162 },
  { streak: 7, weekCards: 95 },
  { streak: 6, weekCards: 120, following: true },
  { streak: 5, weekCards: 133 },
  { streak: 4, weekCards: 71 },
  { streak: 3, weekCards: 64 },
  { streak: 2, weekCards: 52 },
  { streak: 2, weekCards: 40 },
  { streak: 1, weekCards: 33 },
];

/** Per app language: a name for each of SCORES, in its order, and "me". English for the rest. */
export const DEMO_NAMES: { en: DemoNames } & Partial<Record<Language, DemoNames>> = {
  en: {
    people: [
      ['Minh Anh', 'minhanh'],
      ['Jonas', 'jonas.k'],
      ['Priya', 'priya_s'],
      ['Hana', 'hana.t'],
      ['Diego', 'diego.r'],
      ['Thảo', 'thao.ng'],
      ['Emma', 'emma.w'],
      ['Kenji', 'kenji'],
      ['Lucas', 'lucas.m'],
      ['Aisha', 'aisha.b'],
      ['Quang', 'quang.vu'],
      ['Sofia', 'sofia.l'],
      ['Tom', 'tom_b'],
      ['Mai', 'mai.pham'],
      ['Omar', 'omar.h'],
      ['Chloé', 'chloe'],
      ['Bảo', 'bao.tran'],
    ],
    me: ['Nam', 'nam'],
  },
  vi: {
    people: [
      ['Minh Anh', 'minhanh'],
      ['Tuấn', 'tuan.ng'],
      ['Ngọc Hân', 'ngochan'],
      ['Huy', 'huy.tran'],
      ['Linh', 'linh.pham'],
      ['Thảo', 'thao.ng'],
      ['Khánh', 'khanh.ngo'],
      ['Phương', 'phuong.do'],
      ['Đức', 'duc.vu'],
      ['Trang', 'trang.h'],
      ['Quang', 'quang.vu'],
      ['Hà My', 'hamy'],
      ['Long', 'long.bui'],
      ['Mai', 'mai.pham'],
      ['Bảo', 'bao.tran'],
      ['Vy', 'vy.ho'],
      ['Hiếu', 'hieu.dang'],
    ],
    me: ['Nam', 'nam'],
  },
  hi: {
    people: [
      ['अनन्या', 'ananya.k'],
      ['Rohan', 'rohan_m'],
      ['प्रिया', 'priya.s'],
      ['कबीर', 'kabir.v'],
      ['इशिता', 'ishita.r'],
      ['अर्जुन', 'arjun.p'],
      ['Sneha', 'sneha.j'],
      ['फ़ैज़ान', 'faizan'],
      ['मीरा', 'meera.n'],
      ['आदित्य', 'aditya.g'],
      ['Neha', 'neha_t'],
      ['साहिल', 'sahil.k'],
      ['दिव्या', 'divya.m'],
      ['रिया', 'riya.s'],
      ['Karan', 'karan.b'],
      ['पूजा', 'pooja.d'],
      ['यश', 'yash'],
    ],
    me: ['आरव', 'aarav'],
  },
  bn: {
    people: [
      ['নুসরাত', 'nusrat.t'],
      ['Tanvir', 'tanvir.h'],
      ['সাদিয়া', 'sadia.r'],
      ['তাহমিদ', 'tahmid.r'],
      ['আয়েশা', 'ayesha.k'],
      ['ফারহান', 'farhan.i'],
      ['Tasnim', 'tasnim.a'],
      ['রাকিব', 'rakib.h'],
      ['তানজিলা', 'tanjila.s'],
      ['ইমরান', 'imran.c'],
      ['মাহি', 'mahi.r'],
      ['Arif', 'arif_b'],
      ['সুমাইয়া', 'sumaiya'],
      ['জয়', 'joy.das'],
      ['ফাহিম', 'fahim.u'],
      ['Nadia', 'nadia.k'],
      ['রিয়াদ', 'riyad.h'],
    ],
    me: ['রাহাত', 'rahat'],
  },
  es: {
    people: [
      ['Lucía', 'lucia.g'],
      ['Mateo', 'mateo.r'],
      ['Valentina', 'valen.m'],
      ['Santiago', 'santi.l'],
      ['Camila', 'camila.p'],
      ['Javier', 'javi.f'],
      ['Sofía', 'sofia.r'],
      ['Alejandro', 'alejo.d'],
      ['Martina', 'martina.c'],
      ['Diego', 'diego.r'],
      ['Paula', 'paula.s'],
      ['Andrés', 'andres.v'],
      ['Daniela', 'dani.h'],
      ['Pablo', 'pablo.m'],
      ['Ximena', 'ximena.o'],
      ['Hugo', 'hugo.b'],
      ['Carmen', 'carmen.t'],
    ],
    me: ['Nico', 'nico'],
  },
  fr: {
    people: [
      ['Léa', 'lea.m'],
      ['Hugo', 'hugo.d'],
      ['Chloé', 'chloe.b'],
      ['Louis', 'louis.r'],
      ['Manon', 'manon.l'],
      ['Lucas', 'lucas.m'],
      ['Camille', 'camille.p'],
      ['Gabriel', 'gab.r'],
      ['Inès', 'ines.k'],
      ['Arthur', 'arthur.v'],
      ['Jade', 'jade.f'],
      ['Théo', 'theo.g'],
      ['Emma', 'emma.c'],
      ['Nathan', 'nathan.b'],
      ['Sarah', 'sarah.l'],
      ['Yanis', 'yanis.a'],
      ['Zoé', 'zoe.m'],
    ],
    me: ['Jules', 'jules'],
  },
  pt: {
    people: [
      ['Ana Clara', 'anaclara'],
      ['Gabriel', 'gabriel.s'],
      ['Beatriz', 'bia.lima'],
      ['João Pedro', 'joaopedro.l'],
      ['Larissa', 'larissa.g'],
      ['Rafael', 'rafa.c'],
      ['Júlia', 'julia.r'],
      ['Lucas', 'lucas.a'],
      ['Mariana', 'mari.f'],
      ['Guilherme', 'gui.o'],
      ['Letícia', 'leticia.b'],
      ['Matheus', 'matheus.p'],
      ['Camila', 'camila.n'],
      ['Felipe', 'felipe.r'],
      ['Isabela', 'isa.m'],
      ['Thiago', 'thiago.v'],
      ['Fernanda', 'fernanda.c'],
    ],
    me: ['Davi', 'davi'],
  },
};

const namesFor = (lang: Language): DemoNames => DEMO_NAMES[lang] ?? DEMO_NAMES.en;

/** The made-up people, named for the app's language. */
export function demoPeople(lang: Language = language()): DemoPerson[] {
  const { people } = namesFor(lang);
  return SCORES.map((score, i) => ({
    displayName: people[i][0],
    username: people[i][1],
    ...score,
  }));
}

/** This phone's own made-up profile, named for the app's language. */
export function demoMe(lang: Language = language()): Profile {
  const [displayName, username] = namesFor(lang).me;
  return { id: 'demo-me', displayName, username, anonymous: false, hidden: false };
}

/** The board the Worker would answer (`min`: Everyone's "50+ cards this week" filter). */
export function demoView(
  tab: Tab,
  by: Ranking,
  min: number,
  me: { streak: number; weekCards: number },
  lang: Language = language(),
): View {
  const { id, displayName, username } = demoMe(lang);
  const { streak, weekCards } = me;
  const mine: Row = { id, displayName, username, rank: 0, streak, weekCards, me: true };
  const people: Row[] = demoPeople(lang).map(({ following, ...person }, i) => ({
    id: `demo-${i + 1}`,
    rank: 0,
    ...person,
    ...(following ? { following } : {}),
  }));
  const shown =
    tab === 'friends'
      ? [mine, ...people.filter((p) => p.following)]
      : [mine, ...people].filter((p) => p.weekCards >= min);
  const score = (row: Row) => (by === 'streak' ? row.streak : row.weekCards);
  const other = (row: Row) => (by === 'streak' ? row.weekCards : row.streak);
  shown.sort((a, b) => score(b) - score(a) || other(b) - other(a));
  const rows = shown.map((row, i) => ({ ...row, rank: i + 1 }));
  for (const [i, row] of rows.entries()) {
    if (i > 0 && score(row) === score(rows[i - 1])) row.rank = rows[i - 1].rank;
  }
  return {
    rows,
    me: {
      rank: rows.find((row) => row.me)?.rank ?? null,
      streak: me.streak,
      weekCards: me.weekCards,
    },
    // Like the Worker: Everyone says how old it is ("Updated 4 min ago"); Friends is fresh.
    ...(tab === 'everyone' ? { updatedMinutesAgo: DEMO_UPDATED_MINUTES_AGO } : {}),
  };
}

export const DEMO_UPDATED_MINUTES_AGO = 4;
