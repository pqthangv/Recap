import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Deck } from '@/db/schema';
import { colors, radius, touchTarget } from '@/lib/theme';

type Props = {
  visible: boolean;
  /** Decks the cards can move to (not the one they're in). */
  decks: readonly Deck[];
  count: number;
  onMove: (deck: Deck) => void;
  onClose: () => void;
};

/** Bottom sheet: "Move N cards to…" with a list of decks. */
export function MoveCardsSheet({ visible, decks, count, onMove, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Text accessibilityRole="header" style={styles.title}>
          Move {count === 1 ? '1 card' : `${count} cards`} to…
        </Text>
        {decks.length === 0 ? (
          <Text style={styles.empty}>Make another deck first.</Text>
        ) : (
          <ScrollView style={styles.list}>
            {decks.map((deck) => (
              <Pressable
                key={deck.id}
                accessibilityRole="button"
                accessibilityLabel={`Move to ${deck.name}`}
                onPress={() => onMove(deck)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={[styles.dot, { backgroundColor: deck.color }]} />
                <Text style={styles.name}>{deck.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(26, 21, 48, 0.35)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingTop: 16,
    paddingHorizontal: 12,
    maxHeight: '75%',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  list: { flexGrow: 0 },
  row: {
    minHeight: touchTarget + 8,
    paddingHorizontal: 16,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pressed: { backgroundColor: colors.surface },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { flex: 1, fontSize: 17, color: colors.text },
  cancel: { fontSize: 17, color: colors.muted },
  empty: { fontSize: 15, color: colors.muted, paddingHorizontal: 16, paddingVertical: 12 },
});
