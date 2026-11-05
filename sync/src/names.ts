// Leaderboard names (roadmap 6.8): what a username and a display name may be, and the word filter
// both go through before they're saved. The board checks them again before showing them, so a
// word added here later also hides names already on the board. app/src/lib/leaderboard/names.ts is
// a copy (keep the two the same), so the app can say what's wrong before sending.
// The lists are short and Recap's own; the Report button (src/board.ts) catches the rest.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const DISPLAY_NAME_MAX = 30;

const USERNAME = /^[a-z0-9][a-z0-9._]*$/;
// Letters in any language with their accents, digits, spaces and a little punctuation. No emoji.
const DISPLAY_NAME = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'_-]*$/u;

export type NameProblem = 'too_short' | 'too_long' | 'characters' | 'not_allowed';

/** Digits people use for letters ("s3x"). */
const DIGITS: Record<string, string> = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b' };

/** Whole words, compared without accents. */
const WORDS = new Set([
  'arse',
  'ass',
  'asses',
  'asshole',
  'bastard',
  'bitch',
  'bitches',
  'boob',
  'boobs',
  'butthole',
  'cock',
  'cocks',
  'cum',
  'cunt',
  'dick',
  'dicks',
  'dildo',
  'fag',
  'fags',
  'faggot',
  'fuck',
  'fucker',
  'fucking',
  'hitler',
  'horny',
  'jizz',
  'kkk',
  'nazi',
  'nazis',
  'nigga',
  'nigger',
  'nude',
  'nudes',
  'penis',
  'porn',
  'porno',
  'pussy',
  'rape',
  'rapist',
  'retard',
  'sex',
  'sexy',
  'shit',
  'slut',
  'sluts',
  'tits',
  'titty',
  'twat',
  'vagina',
  'wank',
  'wanker',
  'whore',
  'xxx',
  // Vietnamese short forms, typed without accents.
  'cmm',
  'dcm',
  'dit',
  'djt',
  'dkm',
  'dm',
  'dmm',
  'vcl',
  'vkl',
  'clm',
  'clgt',
  'cmnr',
  'dcmm',
  'dmcs',
  'mmb',
  // Regional slurs written as one word (as two, they're in PAIRS).
  'backy',
  'namky',
  // Passing for Recap's own people (also STAFF below), as whole words ("Stafford" is a name).
  'mod',
  'mods',
  'staff',
]);

/**
 * Vietnamese whole words, with their accents: without them they're everyday words ("lon", "cac",
 * "deo", "di"), so only the accented spelling counts.
 */
const VI_WORDS = new Set([
  'buồi',
  'cặc',
  'cứt',
  'địt',
  'đéo',
  'đĩ',
  'đụ',
  'lồn',
  'đjt',
  'đm',
  'đmm',
]);

/**
 * Inside any word, without accents or spaces ("xxfuckxx"): only ones no ordinary name holds (not
 * "shit", which is in Toshiteru, or "rapist", in therapist).
 */
const PARTS = [
  'asshole',
  'bitch',
  'blowjob',
  'cunt',
  'dickhead',
  'dildo',
  'faggot',
  'fuck',
  'handjob',
  'hitler',
  'jizz',
  'motherf',
  'nigga',
  'nigger',
  'porn',
  'pussy',
  'retard',
  'wanker',
  'whore',
  'ditme',
  'dume',
  'memaybeo',
];

/** Two words in a row, without accents. */
const PAIRS = [
  ['dit', 'me'],
  ['dit', 'ma'],
  ['du', 'me'],
  ['du', 'ma'],
  ['oc', 'cho'],
  // Regional slurs (user, 2026-11-05): "bắc kỳ", "nam kỳ", with or without accents.
  ['bac', 'ky'],
  ['nam', 'ky'],
];

/** Two words in a row, with their accents ("Thắng" is a name, "thằng chó" an insult). */
const VI_PAIRS = [
  ['thằng', 'chó'],
  ['đồ', 'chó'],
  ['óc', 'chó'],
  // Passing for Recap's own people: admin, support, moderator, official.
  ['quản', 'trị'],
  ['hỗ', 'trợ'],
  ['điều', 'hành'],
  ['chính', 'thức'],
];

/**
 * Words that pass for Recap's own people, at the start or end of any word, without accents or
 * spaces: "Recap Admin", "theadmin", "adm1n", "Support Team", but not "badminton".
 */
const STAFF = ['admin', 'moderator', 'official', 'recap', 'support'];
const isStaff = (word: string) => STAFF.some((s) => word.startsWith(s) || word.endsWith(s));

const hasPair = (words: readonly string[], pairs: readonly string[][]) =>
  words.some((word, i) => pairs.some(([a, b]) => word === a && words[i + 1] === b));

/** Names that could pass for Recap itself, or for an anonymous row (without accents or spaces). */
const RESERVED = new Set([
  'admin',
  'andanh',
  'anonymous',
  'hidden',
  'moderator',
  'recap',
  'support',
]);

const withoutAccents = (word: string) =>
  word.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

/** False if the name has a word from the lists, or is one Recap keeps for itself. */
export function isAllowed(name: string): boolean {
  const lower = name
    .normalize('NFC')
    .toLowerCase()
    .replace(/[0-9]/g, (digit) => DIGITS[digit] ?? ' ');
  const words = lower.split(/[^\p{L}\p{M}]+/u).filter(Boolean);
  const plain = words.map(withoutAccents);
  const joined = plain.join('');
  if (words.some((word) => VI_WORDS.has(word)) || plain.some((word) => WORDS.has(word))) {
    return false;
  }
  if (PARTS.some((part) => joined.includes(part))) return false;
  if (hasPair(plain, PAIRS) || hasPair(words, VI_PAIRS)) return false;
  if (isStaff(joined) || plain.some(isStaff)) return false;
  return !RESERVED.has(joined);
}

/** A username as it's kept: lowercase, no spaces around it. */
export const cleanUsername = (input: string) => input.trim().toLowerCase();

/** A display name as it's kept: one form for accents (NFC), single spaces, none around it. */
export const cleanDisplayName = (input: string) =>
  input.normalize('NFC').trim().replace(/\s+/g, ' ');

/** What's wrong with a (cleaned) username, or null. */
export function usernameProblem(username: string): NameProblem | null {
  if (username.length < USERNAME_MIN) return 'too_short';
  if (username.length > USERNAME_MAX) return 'too_long';
  if (!USERNAME.test(username)) return 'characters';
  return isAllowed(username) ? null : 'not_allowed';
}

/** What's wrong with a (cleaned) display name, or null. */
export function displayNameProblem(name: string): NameProblem | null {
  const length = [...name].length;
  if (length === 0) return 'too_short';
  if (length > DISPLAY_NAME_MAX) return 'too_long';
  if (!DISPLAY_NAME.test(name)) return 'characters';
  return isAllowed(name) ? null : 'not_allowed';
}
