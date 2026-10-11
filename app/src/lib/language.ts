// Picks the voice for reading a card aloud. Recap reads English and Vietnamese, so this only has
// to tell those two apart, per side of the card (a vocabulary card can be English on the front
// and Vietnamese on the back).

export type SpeechLanguage = 'en' | 'vi';

// Letters only Vietnamese uses: đ ă ơ ư ĩ ũ and the "Latin Extended Additional" block
// (ạ ả ấ ầ ẩ ẫ ậ … ỹ), plus the combining hook above / horn / dot below for decomposed text.
const VIETNAMESE_ONLY = /[đĐăĂơƠưƯĩĨũŨẠ-ỵ̛̃̉]/;

// Accented letters Vietnamese shares with French/Spanish/etc. (cá, tôi, bà, là …).
const VIETNAMESE_SHARED = /[àáâãèéêìíòóôõùúýÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝ̀́̂̃]/;

// Vietnamese has no f, j, w or z, so these mark an English loanword like "café".
const NOT_VIETNAMESE = /[fjwzFJWZ]/;

export function detectLanguage(text: string): SpeechLanguage {
  if (VIETNAMESE_ONLY.test(text)) return 'vi';
  if (VIETNAMESE_SHARED.test(text) && !NOT_VIETNAMESE.test(text)) return 'vi';
  return 'en';
}

/** BCP-47 tag for the text-to-speech engine. */
export const SPEECH_LOCALES: Record<SpeechLanguage, string> = { en: 'en-US', vi: 'vi-VN' };
