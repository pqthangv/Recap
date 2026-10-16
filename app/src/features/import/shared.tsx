import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { showSnackbar } from '@/components/Snackbar';
import type { ImportSummary, ImportTarget } from '@/db/import';
import type { Deck } from '@/db/schema';
import { t, tn } from '@/lib/i18n';
import { type Colors, useStyles } from '@/lib/theme';

/** Default "Add to": decks from the file if offered, else a new deck named after the file. */
export function defaultTarget(name: string, fromFile?: string): ImportTarget {
  return fromFile !== undefined
    ? { kind: 'fromFile', fallbackName: fromFile }
    : { kind: 'new', name };
}

export function targetIsValid(target: ImportTarget, decks: readonly Deck[]): boolean {
  if (target.kind === 'new') return target.name.trim() !== '';
  if (target.kind === 'existing') return decks.some((d) => d.id === target.deckId);
  return true;
}

export function summaryText(s: ImportSummary): string {
  if (s.added === 0) return t('import.nothingNew');
  const added = t('import.addedTo', {
    cards: tn('count.card', s.added),
    deck: s.decks.length === 1 ? s.decks[0].name : tn('count.deck', s.decks.length),
  });
  return s.skipped ? `${added} · ${t('import.alreadyThere', { n: s.skipped })}` : added;
}

/** After an import: say what happened, then go to the deck (or home, for several decks). */
export function useFinishImport() {
  const router = useRouter();
  return (summary: ImportSummary, note?: string) => {
    showSnackbar(note ? `${summaryText(summary)} · ${note}` : summaryText(summary));
    router.dismissTo('/');
    if (summary.decks.length === 1) {
      router.push({ pathname: '/deck/[id]', params: { id: summary.decks[0].id } });
    }
  };
}

/** The first few cards, so people can check the import looks right. */
export function CardPreview({
  cards,
  total,
}: {
  cards: readonly { front: string; back: string }[];
  total: number;
}) {
  const styles = useStyles(makeStyles);
  if (total === 0) return null;
  return (
    <View style={styles.preview}>
      <Text style={styles.label}>
        {total > cards.length
          ? t('import.previewFirst', { shown: cards.length, total })
          : t('import.preview')}
      </Text>
      {cards.map((c, i) => (
        <View key={i} style={styles.row}>
          <Text style={styles.front} numberOfLines={2}>
            {c.front}
          </Text>
          <Text style={styles.back} numberOfLines={2}>
            {c.back}
          </Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    preview: { gap: 2 },
    label: { fontSize: 15, fontWeight: '600', color: colors.muted, marginBottom: 4 },
    row: {
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    front: { fontSize: 16, fontWeight: '600', color: colors.text },
    back: { fontSize: 15, color: colors.muted, marginTop: 2 },
  });
