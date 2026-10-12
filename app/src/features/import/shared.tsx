import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { showSnackbar } from '@/components/Snackbar';
import type { ImportSummary, ImportTarget } from '@/db/import';
import type { Deck } from '@/db/schema';
import { count, plural } from '@/lib/format';
import { colors } from '@/lib/theme';

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
  if (s.added === 0) return 'Nothing new to add — those cards are already there.';
  const where = s.decks.length === 1 ? ` to ${s.decks[0].name}` : ` to ${s.decks.length} decks`;
  const dupes = s.skipped ? ` · ${count(s.skipped)} already there` : '';
  return `Added ${plural(s.added, 'card')}${where}${dupes}`;
}

/** After an import: say what happened, then go to the deck (or home, for several decks). */
export function useFinishImport() {
  const router = useRouter();
  return (summary: ImportSummary) => {
    showSnackbar(summaryText(summary));
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
  if (total === 0) return null;
  return (
    <View style={styles.preview}>
      <Text style={styles.label}>
        Preview{total > cards.length ? ` (first ${cards.length} of ${total})` : ''}
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

const styles = StyleSheet.create({
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
