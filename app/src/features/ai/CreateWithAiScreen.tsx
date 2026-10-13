import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
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
import { Stepper } from '@/components/Stepper';
import {
  AiError,
  MAX_CARDS_PER_REQUEST,
  MAX_INPUT_CHARS,
  MAX_TOPIC_CHARS,
  type PdfText,
} from '@/lib/ai';
import type { AiSource } from '@/lib/aiReview';
import { plural } from '@/lib/format';
import { colors, radius, touchTarget } from '@/lib/theme';

import { askAiConsent } from './consent';
import { ai, useAiDraft } from './api';
import { readTextFromPhoto } from './photo';

type Tab = 'text' | 'photo' | 'pdf' | 'topic';

const TABS: { key: Tab; label: string }[] = [
  { key: 'text', label: 'Paste text' },
  { key: 'photo', label: 'Photo' },
  { key: 'pdf', label: 'PDF' },
  { key: 'topic', label: 'Topic' },
];

type QuotaState =
  | { status: 'loading' }
  | { status: 'ready'; remaining: number }
  | { status: 'failed'; message: string };

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const SOMETHING_WRONG = 'Something went wrong. Please try again.';

const messageOf = (e: unknown) => (e instanceof AiError ? e.message : SOMETHING_WRONG);

/** "Create with AI": paste text, a photo of notes, a PDF or a topic → cards to review. */
export default function CreateWithAiScreen() {
  const router = useRouter();
  const draft = useAiDraft((s) => s.cards);
  const [tab, setTab] = useState<Tab>('text');
  const [pasted, setPasted] = useState('');
  const [photoText, setPhotoText] = useState('');
  const [pdf, setPdf] = useState<(PdfText & { fileName: string }) | null>(null);
  const [topic, setTopic] = useState('');
  const [maxCards, setMaxCards] = useState(10);
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

  const input =
    tab === 'text'
      ? pasted
      : tab === 'photo'
        ? photoText
        : tab === 'pdf'
          ? (pdf?.text ?? '')
          : topic;
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
    await run('Making cards…', async () => {
      const source: AiSource =
        tab === 'topic'
          ? { kind: 'topic', topic }
          : tab === 'pdf' && pdf
            ? { kind: 'pdf', fileName: pdf.fileName }
            : tab === 'photo'
              ? { kind: 'photo' }
              : { kind: 'text' };
      const result = await ai.generate({
        text: input.trim(),
        mode: tab === 'topic' ? 'topic' : 'text',
        maxCards: Math.min(maxCards, cardLimit),
      });
      setQuota({ status: 'ready', remaining: result.remaining });
      useAiDraft.setState({ cards: result.cards, source });
      router.push('/ai/review');
    });
  };

  const choosePdf = async () => {
    // The PDF itself goes to Recap's server to be read, so ask before it's even picked.
    if (!(await askAiConsent())) return;
    await run('Reading the PDF…', async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || picked.assets.length === 0) return;
      const asset = picked.assets[0];
      try {
        if (asset.size && asset.size > MAX_PDF_BYTES) {
          throw new AiError('input', 'That PDF is too big. The limit is 10 MB.');
        }
        const result = await ai.extractPdf(new File(asset.uri), asset.name);
        setPdf({ ...result, fileName: asset.name });
      } finally {
        try {
          new File(asset.uri).delete(); // the picker's copy in the cache
        } catch {
          // Already gone.
        }
      }
    });
  };

  const choosePhoto = (from: 'camera' | 'library') =>
    run('Reading the photo…', async () => {
      const text = await readTextFromPhoto(from);
      if (text !== null) setPhotoText(text);
    });

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
              {plural(draft.length, 'card')} waiting for review · Review
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
              onPress={() => {
                setTab(t.key);
                setError(null);
              }}
              style={[styles.tab, tab === t.key && styles.tabSelected]}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextSelected]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'text' ? (
          <TextArea
            value={pasted}
            onChange={setPasted}
            placeholder="Paste your notes, an article or a list of words."
            label="Text to make cards from"
          />
        ) : null}

        {tab === 'photo' ? (
          <>
            <Text style={styles.help}>
              Take a clear photo of your notes or a page. The text is read on your phone.
            </Text>
            <View style={styles.row}>
              <Button
                variant="secondary"
                label="Take a photo"
                onPress={() => choosePhoto('camera')}
                disabled={!!busy}
                style={styles.flex}
              />
              <Button
                variant="secondary"
                label="Choose a photo"
                onPress={() => choosePhoto('library')}
                disabled={!!busy}
                style={styles.flex}
              />
            </View>
            {photoText ? (
              <>
                <Text style={styles.help}>
                  Text from your photo. Fix anything that looks wrong.
                </Text>
                <TextArea value={photoText} onChange={setPhotoText} label="Text from your photo" />
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'pdf' ? (
          <>
            <Button
              variant="secondary"
              label={pdf ? 'Choose another PDF' : 'Choose a PDF'}
              onPress={choosePdf}
              disabled={!!busy}
            />
            {pdf ? (
              <>
                <Text style={styles.help}>
                  {pdf.fileName} · {plural(pdf.pages, 'page')}
                  {pdf.truncated
                    ? ` · Only the first ${MAX_INPUT_CHARS.toLocaleString('en-US')} characters are used.`
                    : ''}
                </Text>
                <TextArea
                  value={pdf.text}
                  onChange={(text) => setPdf({ ...pdf, text })}
                  label="Text from your PDF"
                />
              </>
            ) : (
              <Text style={styles.help}>PDFs with selectable text, up to 10 MB.</Text>
            )}
          </>
        ) : null}

        {tab === 'topic' ? (
          <TextInput
            value={topic}
            onChangeText={setTopic}
            placeholder="e.g. The water cycle"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Topic"
            maxLength={MAX_TOPIC_CHARS}
            returnKeyType="done"
            style={styles.topic}
          />
        ) : null}

        {tab !== 'topic' && input ? (
          <Text style={[styles.counter, tooLong && styles.error]}>
            {input.trim().length.toLocaleString('en-US')} /{' '}
            {MAX_INPUT_CHARS.toLocaleString('en-US')} characters
          </Text>
        ) : null}

        <Stepper
          label="Cards"
          value={Math.min(maxCards, cardLimit)}
          display={String(Math.min(maxCards, cardLimit))}
          min={1}
          max={cardLimit}
          step={1}
          onChange={setMaxCards}
        />

        <Button size="lg" label="Make cards" onPress={generate} disabled={!canGenerate} />

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
            ? 'Checking your AI cards for today…'
            : quota.status === 'failed'
              ? quota.message
              : quota.remaining > 0
                ? `${plural(quota.remaining, 'AI card')} left today`
                : 'No AI cards left today. More tomorrow!'}
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
