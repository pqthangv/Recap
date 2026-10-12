import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { listDecks } from '@/db/decks';
import { importCards, type ImportTarget } from '@/db/import';
import { useLive } from '@/db/live';
import { plural } from '@/lib/format';
import { AnkiImportError } from '@/lib/import/anki';
import { colors } from '@/lib/theme';

import { DeckTarget } from './DeckTarget';
import {
  baseName,
  clearPickedFiles,
  copyPictures,
  ImportFileError,
  loadAnkiDeck,
  pictureCounts,
  removeUnusedPictures,
  useImportDraft,
  type AnkiDraft,
  type LoadedAnkiDeck,
} from './files';
import { CardPreview, defaultTarget, targetIsValid, useFinishImport } from './shared';

type Phase =
  | { step: 'reading' }
  | { step: 'ready'; deck: LoadedAnkiDeck }
  | { step: 'saving'; deck: LoadedAnkiDeck; message: string }
  | { step: 'failed'; message: string };

/** Decks can be exported without their media; say so instead of promising pictures. */
function missingPictures(n: number): string {
  if (n === 0) return '';
  if (n === 1) return "1 picture isn't in this file, so its card shows without it. ";
  return `${n} pictures aren't in this file, so those cards show without them. `;
}

function friendly(e: unknown): string {
  if (e instanceof AnkiImportError || e instanceof ImportFileError) return e.message;
  return "Recap couldn't read this deck. It may be damaged, or too big for this phone.";
}

export default function AnkiImportScreen() {
  const router = useRouter();
  const draft = useImportDraft((s) => s.anki);
  if (!draft) {
    return (
      <View style={styles.content}>
        <Text style={styles.help}>Choose a deck to import first.</Text>
        <Button label="Back" onPress={() => router.back()} />
      </View>
    );
  }
  return <AnkiImport draft={draft} />;
}

function AnkiImport({ draft }: { draft: AnkiDraft }) {
  const router = useRouter();
  const decks = useLive(listDecks, ['decks']);
  const finish = useFinishImport();
  const name = baseName(draft.fileName);
  const [phase, setPhase] = useState<Phase>({ step: 'reading' });
  const [target, setTarget] = useState<ImportTarget>(() => defaultTarget(name, name));

  useEffect(() => {
    let cancelled = false;
    loadAnkiDeck(draft).then(
      (deck) => !cancelled && setPhase({ step: 'ready', deck }),
      (e: unknown) => {
        console.warn(e);
        if (!cancelled) setPhase({ step: 'failed', message: friendly(e) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [draft]);

  if (phase.step === 'reading' || phase.step === 'saving') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.help} accessibilityLiveRegion="polite">
          {phase.step === 'reading' ? 'Reading the deck…' : phase.message}
        </Text>
      </View>
    );
  }
  if (phase.step === 'failed') {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>Couldn&apos;t import this deck</Text>
        <Text style={styles.help}>{phase.message}</Text>
        <Button label="Back" onPress={() => router.back()} />
      </View>
    );
  }

  const { deck } = phase;
  const pictures = pictureCounts(deck.cards, deck.pkg);
  const perDeck = new Map<string, number>();
  for (const c of deck.cards) perDeck.set(c.deckName, (perDeck.get(c.deckName) ?? 0) + 1);
  const canImport = deck.cards.length > 0 && targetIsValid(target, decks);

  const save = async () => {
    if (!canImport) return;
    const saving = (message: string) => setPhase({ step: 'saving', deck, message });
    saving('Saving cards…');
    let uris = new Map<string, string>();
    try {
      uris = await copyPictures(deck.cards, deck.pkg, (done, total) =>
        saving(`Saving pictures… ${done} of ${total}`),
      );
      saving('Saving cards…');
      const items = deck.cards.map((c) => {
        const uri = c.image ? uris.get(c.image.name) : undefined;
        return {
          front: c.front,
          back: c.back,
          tags: c.tags,
          deckName: c.deckName,
          imageUri: uri ?? null,
          imageSide: uri ? c.image?.side : null,
        };
      });
      const summary = importCards(items, target);
      removeUnusedPictures(uris, summary.imageUris);
      clearPickedFiles();
      finish(summary);
    } catch (e) {
      console.warn(e);
      removeUnusedPictures(uris, []);
      setPhase({ step: 'failed', message: "Recap couldn't save these cards. Please try again." });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {plural(deck.cards.length, 'card')} in {plural(perDeck.size, 'deck')}
      </Text>
      <View>
        {[...perDeck].map(([deckName, n]) => (
          <Text key={deckName} style={styles.deckLine}>
            {deckName} · {n}
          </Text>
        ))}
      </View>
      <Text style={styles.help}>
        {pictures.found > 0 ? `${plural(pictures.found, 'picture')} will be saved. ` : ''}
        {missingPictures(pictures.missing)}
        Cards start as new cards. Sounds aren&apos;t imported; Recap can read cards aloud instead.
        {deck.skipped > 0 ? ` ${plural(deck.skipped, 'card')} with no text will be skipped.` : ''}
      </Text>
      <CardPreview cards={deck.cards.slice(0, 5)} total={deck.cards.length} />
      <DeckTarget
        value={target}
        onChange={setTarget}
        decks={decks}
        suggestedName={name}
        fromFile={{
          label: perDeck.size > 1 ? 'Same decks as the file' : `“${[...perDeck.keys()][0]}”`,
          fallbackName: name,
        }}
      />
      <Button
        size="lg"
        label={`Import ${plural(deck.cards.length, 'card')}`}
        onPress={save}
        disabled={!canImport}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  help: { fontSize: 15, color: colors.muted, textAlign: 'left' },
  deckLine: { fontSize: 16, color: colors.text, paddingVertical: 2 },
});
