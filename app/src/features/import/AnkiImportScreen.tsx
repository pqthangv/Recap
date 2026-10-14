import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { listDecks } from '@/db/decks';
import { importCards, type ImportTarget } from '@/db/import';
import { useLive } from '@/db/live';
import { t, tn } from '@/lib/i18n';
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
  type CopiedPictures,
  type LoadedAnkiDeck,
} from './files';
import { CardPreview, defaultTarget, targetIsValid, useFinishImport } from './shared';

type Phase =
  | { step: 'reading' }
  | { step: 'ready'; deck: LoadedAnkiDeck }
  | { step: 'saving'; deck: LoadedAnkiDeck; message: string }
  | { step: 'failed'; message: string };

function friendly(e: unknown): string {
  if (e instanceof AnkiImportError || e instanceof ImportFileError) return e.message;
  return t('anki.unreadable');
}

export default function AnkiImportScreen() {
  const router = useRouter();
  const draft = useImportDraft((s) => s.anki);
  if (!draft) {
    return (
      <View style={styles.content}>
        <Text style={styles.help}>{t('import.chooseDeckFirst')}</Text>
        <Button label={t('common.back')} onPress={() => router.back()} />
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
          {phase.step === 'reading' ? t('anki.reading') : phase.message}
        </Text>
      </View>
    );
  }
  if (phase.step === 'failed') {
    return (
      <View style={styles.content}>
        <Text style={styles.title}>{t('anki.failedTitle')}</Text>
        <Text style={styles.help}>{phase.message}</Text>
        <Button label={t('common.back')} onPress={() => router.back()} />
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
    saving(t('import.savingCards'));
    let copied: CopiedPictures | null = null;
    try {
      copied = await copyPictures(deck.cards, deck.pkg, (done, total) =>
        saving(t('import.savingPictures', { done, total })),
      );
      saving(t('import.savingCards'));
      const refs = copied.refs;
      const items = deck.cards.map((c) => {
        const ref = c.image ? refs.get(c.image.name) : undefined;
        return {
          front: c.front,
          back: c.back,
          tags: c.tags,
          deckName: c.deckName,
          imageUri: ref ?? null,
          imageSide: ref ? c.image?.side : null,
        };
      });
      const summary = importCards(items, target);
      removeUnusedPictures(copied);
      clearPickedFiles();
      finish(summary, copied.refused > 0 ? tn('anki.picturesRefused', copied.refused) : undefined);
    } catch (e) {
      console.warn(e);
      removeUnusedPictures(copied);
      setPhase({ step: 'failed', message: t('import.saveFailed') });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets // iOS: keep the new deck name above the keyboard
    >
      <Text style={styles.title}>
        {t('anki.summary', {
          cards: tn('count.card', deck.cards.length),
          decks: tn('count.deck', perDeck.size),
        })}
      </Text>
      <View>
        {[...perDeck].map(([deckName, n]) => (
          <Text key={deckName} style={styles.deckLine}>
            {deckName} · {n}
          </Text>
        ))}
      </View>
      <Text style={styles.help}>
        {[
          // Decks can be exported without their media; say so instead of promising pictures.
          pictures.found > 0
            ? t('anki.picturesSaved', { pictures: tn('count.picture', pictures.found) })
            : null,
          pictures.missing > 0 ? tn('anki.missingPictures', pictures.missing) : null,
          t('anki.startNew'),
          deck.skipped > 0 ? t('anki.skipped', { cards: tn('count.card', deck.skipped) }) : null,
        ]
          .filter(Boolean)
          .join(' ')}
      </Text>
      <CardPreview cards={deck.cards.slice(0, 5)} total={deck.cards.length} />
      <DeckTarget
        value={target}
        onChange={setTarget}
        decks={decks}
        suggestedName={name}
        fromFile={{
          label: perDeck.size > 1 ? t('anki.sameDecks') : `“${[...perDeck.keys()][0]}”`,
          fallbackName: name,
        }}
      />
      <Button
        size="lg"
        label={t('import.importN', { cards: tn('count.card', deck.cards.length) })}
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
