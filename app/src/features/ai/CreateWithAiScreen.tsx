import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { SideLanguages } from '@/components/SideLanguages';
import { Stepper } from '@/components/Stepper';
import { getRawSetting, setRawSetting } from '@/db/settings';
import { discardPicked, pickedUpload } from '@/features/files/picked';
import { AiError, MAX_CARDS_PER_REQUEST, MAX_INPUT_CHARS, MAX_TOPIC_CHARS } from '@/lib/ai';
import { addToNotes, notesSourceAfter, type AiSource } from '@/lib/aiReview';
import { count, t, tn, type StringKey } from '@/lib/i18n';
import { isCardLanguage, type CardLanguage, type SideLanguages as Languages } from '@/lib/language';
import { can } from '@/lib/platform';
import { AI_BACK_LANGUAGE_KEY, AI_FRONT_LANGUAGE_KEY } from '@/lib/settings';
import { colors, radius, touchTarget } from '@/lib/theme';

import { askAiConsent } from './consent';
import { ai, useAiDraft } from './api';
import { readTextFromPhoto } from './photo';

// Two ways to start, so they can't be mixed up: your own notes (typed, pasted, or read from a
// photo or PDF into the same box) or just a topic.
type Tab = 'notes' | 'topic';

const TABS: { key: Tab; label: StringKey }[] = [
  { key: 'notes', label: 'ai.tabNotes' },
  { key: 'topic', label: 'ai.tabTopic' },
];
// One line under the tabs that says how they differ.
const TAB_HELP: Record<Tab, StringKey> = { notes: 'ai.notesHelp', topic: 'ai.topicHelp' };

type QuotaState =
  | { status: 'loading' }
  | { status: 'ready'; remaining: number }
  | { status: 'failed'; message: string };

const MAX_PDF_BYTES = 10 * 1024 * 1024;

const messageOf = (e: unknown) => (e instanceof AiError ? e.message : t('common.somethingWrong'));

// Each side of the cards can be in its own language (e.g. German words, Vietnamese meanings).
// null = Auto: the language of the text or topic. The last choice is kept on this phone, and the
// deck the cards are saved to is read aloud in these languages (see ReviewCardsScreen).
type Side = keyof Languages;
const LANGUAGE_KEYS: Record<Side, string> = {
  front: AI_FRONT_LANGUAGE_KEY,
  back: AI_BACK_LANGUAGE_KEY,
};

function storedLanguage(side: Side): CardLanguage | null {
  const value = getRawSetting(LANGUAGE_KEYS[side]);
  return isCardLanguage(value) ? value : null;
}

/** "Create with AI": your notes (typed, pasted, or read from photos and PDFs) or a topic →
 *  cards to review. */
export default function CreateWithAiScreen() {
  const router = useRouter();
  const draft = useAiDraft((s) => s.cards);
  const [tab, setTab] = useState<Tab>('notes');
  const [notes, setNotes] = useState('');
  // What the notes came from, for the suggested deck name (a PDF's file name, a photo or text).
  const [notesSource, setNotesSource] = useState<AiSource>({ kind: 'text' });
  // What was just added from a photo or PDF (and whether a long PDF was cut).
  const [added, setAdded] = useState<string | null>(null);
  const [topic, setTopic] = useState('');
  const [maxCards, setMaxCards] = useState(10);
  const [languages, setLanguages] = useState<Languages>(() => ({
    front: storedLanguage('front'),
    back: storedLanguage('back'),
  }));
  const [quota, setQuota] = useState<QuotaState>({ status: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Wake the server (free hosting sleeps when idle), then ask how many cards are left today.
  useEffect(() => {
    let active = true;
    ai.warmUp()
      .then(() => ai.quota())
      .then(
        (q) => active && setQuota({ status: 'ready', remaining: q.remaining }),
        (e: unknown) => active && setQuota({ status: 'failed', message: messageOf(e) }),
      );
    return () => {
      active = false;
    };
  }, []);

  const input = tab === 'topic' ? topic : notes;
  const limit = tab === 'topic' ? MAX_TOPIC_CHARS : MAX_INPUT_CHARS;
  const tooLong = input.trim().length > limit;
  const remaining = quota.status === 'ready' ? quota.remaining : MAX_CARDS_PER_REQUEST;
  const cardLimit = Math.max(1, Math.min(MAX_CARDS_PER_REQUEST, remaining));
  const canGenerate =
    !busy && input.trim().length > 0 && !tooLong && !(quota.status === 'ready' && remaining === 0);

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await task();
    } catch (e) {
      console.warn(e);
      setError(messageOf(e));
      if (e instanceof AiError && e.remaining !== undefined) {
        setQuota({ status: 'ready', remaining: e.remaining });
      }
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    if (!(await askAiConsent())) return; // asks once before the first use (see consent.ts)
    await run(t('ai.making'), async () => {
      const source: AiSource = tab === 'topic' ? { kind: 'topic', topic } : notesSource;
      const result = await ai.generate({
        text: input.trim(),
        mode: tab === 'topic' ? 'topic' : 'text',
        maxCards: Math.min(maxCards, cardLimit),
        frontLanguage: languages.front,
        backLanguage: languages.back,
      });
      setQuota({ status: 'ready', remaining: result.remaining });
      useAiDraft.setState({ cards: result.cards, source, languages });
      router.push('/ai/review');
    });
  };

  const choosePdf = async () => {
    // The PDF itself goes to Recap's server to be read, so ask before it's even picked.
    if (!(await askAiConsent())) return;
    await run(t('ai.readingPdf'), async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || picked.assets.length === 0) return;
      const asset = picked.assets[0];
      try {
        if (asset.size && asset.size > MAX_PDF_BYTES) {
          throw new AiError('input', t('ai.pdfTooBig'));
        }
        const result = await ai.extractPdf(pickedUpload(asset), asset.name);
        setNotes((current) => addToNotes(current, result.text));
        setNotesSource((current) =>
          notesSourceAfter(current, { kind: 'pdf', fileName: asset.name }),
        );
        const cut = result.truncated
          ? ` ${t('ai.pdfTruncated', { n: count(MAX_INPUT_CHARS) })}`
          : '';
        setAdded(
          t('ai.pdfAdded', { file: asset.name, pages: tn('count.page', result.pages) }) + cut,
        );
      } finally {
        discardPicked(asset); // the picker's copy in the cache
      }
    });
  };

  const choosePhoto = (from: 'camera' | 'library') =>
    run(t('ai.readingPhoto'), async () => {
      const text = await readTextFromPhoto(from);
      if (text === null) return; // cancelled
      setNotes((current) => addToNotes(current, text));
      setNotesSource((current) => notesSourceAfter(current, { kind: 'photo' }));
      setAdded(t('ai.photoAdded'));
    });

  const editNotes = (text: string) => {
    setNotes(text);
    if (!text.trim()) {
      // Emptied: nothing from a photo or PDF is left to name the deck after.
      setNotesSource({ kind: 'text' });
      setAdded(null);
    }
  };

  const chooseLanguage = (side: Side, code: CardLanguage | null) => {
    setLanguages((current) => ({ ...current, [side]: code }));
    setRawSetting(LANGUAGE_KEYS[side], code);
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {draft ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/ai/review')}
            style={styles.banner}
          >
            <Text style={styles.bannerText}>
              {t('ai.waiting', { cards: tn('count.card', draft.length) })}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item.key }}
              onPress={() => {
                setTab(item.key);
                setError(null);
              }}
              style={[styles.tab, tab === item.key && styles.tabSelected]}
            >
              <Text style={[styles.tabText, tab === item.key && styles.tabTextSelected]}>
                {t(item.label)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.help}>{t(TAB_HELP[tab])}</Text>

        {tab === 'notes' ? (
          <>
            <TextArea
              value={notes}
              onChange={editNotes}
              placeholder={t('ai.textPlaceholder')}
              label={t('ai.textA11y')}
            />
            {notes ? (
              <Text style={[styles.counter, tooLong && styles.error]}>
                {t('ai.counter', { n: count(notes.trim().length), max: count(MAX_INPUT_CHARS) })}
              </Text>
            ) : null}
            {/* Reading text in photos runs on the phone (ML Kit), which the web doesn't have. */}
            {can.photoText ? (
              <View style={styles.row}>
                <Button
                  variant="secondary"
                  label={t('ai.takePhoto')}
                  onPress={() => choosePhoto('camera')}
                  disabled={!!busy}
                  style={styles.flex}
                />
                <Button
                  variant="secondary"
                  label={t('ai.choosePhoto')}
                  onPress={() => choosePhoto('library')}
                  disabled={!!busy}
                  style={styles.flex}
                />
              </View>
            ) : null}
            <Button
              variant="secondary"
              label={t('ai.choosePdf')}
              onPress={choosePdf}
              disabled={!!busy}
            />
            {added ? (
              <Text style={styles.help} accessibilityLiveRegion="polite">
                {added}
              </Text>
            ) : null}
          </>
        ) : (
          <TextInput
            value={topic}
            onChangeText={setTopic}
            placeholder={t('ai.topicPlaceholder')}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t('ai.topicA11y')}
            maxLength={MAX_TOPIC_CHARS}
            returnKeyType="done"
            style={styles.topic}
          />
        )}

        <SideLanguages
          value={languages}
          onChange={chooseLanguage}
          titles={{ front: t('ai.frontLanguageTitle'), back: t('ai.backLanguageTitle') }}
          autoOption={t('ai.languageAutoOption')}
          disabled={!!busy}
        />

        <Stepper
          label={t('ai.cards')}
          value={Math.min(maxCards, cardLimit)}
          display={String(Math.min(maxCards, cardLimit))}
          min={1}
          max={cardLimit}
          step={1}
          onChange={setMaxCards}
        />

        <Button size="lg" label={t('ai.make')} onPress={generate} disabled={!canGenerate} />

        {busy ? (
          <View style={styles.busy} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.help}>{busy}</Text>
          </View>
        ) : null}
        {error ? (
          <Text style={[styles.help, styles.error]} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Text style={styles.quota}>
          {quota.status === 'loading'
            ? t('ai.checkingQuota')
            : quota.status === 'failed'
              ? quota.message
              : quota.remaining > 0
                ? t('ai.left', { cards: tn('count.aiCard', quota.remaining) })
                : t('ai.noneLeft')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TextArea(props: {
  value: string;
  onChange: (text: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChange}
      placeholder={props.placeholder}
      placeholderTextColor={colors.muted}
      accessibilityLabel={props.label}
      multiline
      textAlignVertical="top"
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  banner: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.button,
    backgroundColor: colors.tint,
  },
  bannerText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button - 4,
    paddingHorizontal: 4,
  },
  tabSelected: { backgroundColor: colors.background },
  tabText: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  tabTextSelected: { color: colors.primary, fontWeight: '600' },
  help: { fontSize: 15, color: colors.muted },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  input: {
    minHeight: 180,
    maxHeight: 360,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    padding: 16,
    fontSize: 16,
    color: colors.text,
  },
  topic: {
    minHeight: touchTarget,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: 17,
    color: colors.text,
  },
  counter: { fontSize: 13, color: colors.muted, textAlign: 'right', marginTop: -8 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  error: { color: colors.danger },
  quota: { fontSize: 15, color: colors.text, textAlign: 'center' },
});
