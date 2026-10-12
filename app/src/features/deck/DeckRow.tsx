import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DeckCounts } from '@/db/study';
import { count } from '@/lib/format';
import { colors, radius, touchTarget } from '@/lib/theme';

type Props = {
  name: string;
  color: string;
  counts?: DeckCounts;
  /** Shown before the counts, e.g. "16 decks" for a group. */
  detail?: string;
  /** Draws stacked dots, so a group of decks looks different from one deck. */
  stacked?: boolean;
  onPress: () => void;
};

/** A deck (or deck group) in a list: color, name, what's due, and a chevron. */
export function DeckRow({ name, color, counts, detail, stacked = false, onPress }: Props) {
  const due = counts ?? { due: 0, new: 0 };
  const countText =
    due.due + due.new === 0 ? 'Nothing due' : `${count(due.due)} due · ${count(due.new)} new`;
  const summary = detail ? `${detail} · ${countText}` : countText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${summary}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.dots}>
        {stacked ? <View style={[styles.dot, styles.backDot, { borderColor: color }]} /> : null}
        <View style={[styles.dot, { backgroundColor: color }]} />
      </View>
      <View style={styles.text}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.counts}>{summary}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget + 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: -12,
    borderRadius: radius.button,
    gap: 14,
  },
  rowPressed: { backgroundColor: colors.surface },
  dots: { width: 20, height: 20, justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  backDot: {
    position: 'absolute',
    left: 6,
    top: 0,
    borderWidth: 2,
    backgroundColor: colors.background,
  },
  text: { flex: 1 },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  counts: { fontSize: 14, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 26, color: colors.muted },
});
