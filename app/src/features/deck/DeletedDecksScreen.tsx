import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { showSnackbar } from '@/components/Snackbar';
import { listDeletedDecks, RESTORE_DAYS, restoreDecks, type DeletedDeck } from '@/db/decks';
import { useLive } from '@/db/live';
import { groupColor, groupDecks, type DeckListItem } from '@/lib/deckGroups';
import { daysAgo, plural } from '@/lib/format';
import { colors, touchTarget } from '@/lib/theme';

/** Decks deleted in the last 30 days, with Restore. A deleted group shows as one row. */
export default function DeletedDecksScreen() {
  // "now" is read with the list, so "deleted today" stays right after midnight on refresh.
  const { deleted, now } = useLive(
    () => ({ deleted: listDeletedDecks(), now: Date.now() }),
    ['decks', 'cards'],
  );
  const items = groupDecks(deleted);

  const restore = (item: DeckListItem<DeletedDeck>) => {
    const decks = item.kind === 'deck' ? [item.deck] : item.decks;
    restoreDecks(decks.map((d) => d.id));
    showSnackbar(`Restored “${item.kind === 'deck' ? item.deck.name : item.name}”`);
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => (item.kind === 'deck' ? item.deck.id : `group:${item.name}`)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <Text style={styles.help}>
          Deleted decks stay here for {RESTORE_DAYS} days. Restoring brings back the deck and its
          cards, with their study progress.
        </Text>
      }
      renderItem={({ item }) => {
        const decks = item.kind === 'deck' ? [item.deck] : item.decks;
        const name = item.kind === 'deck' ? item.deck.name : item.name;
        const cardCount = decks.reduce((n, d) => n + d.cards, 0);
        const latest = Math.max(...decks.map((d) => d.deleted_at));
        const detail = [
          item.kind === 'group' ? plural(decks.length, 'deck') : null,
          plural(cardCount, 'card'),
          `deleted ${daysAgo(latest, now)}`,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <View style={styles.row}>
            <View
              style={[
                styles.dot,
                { backgroundColor: item.kind === 'deck' ? item.deck.color : groupColor(decks) },
              ]}
            />
            <View style={styles.text}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.detail}>{detail}</Text>
            </View>
            <Button
              variant="text"
              label={item.kind === 'group' ? 'Restore all' : 'Restore'}
              accessibilityLabel={`Restore ${name}`}
              onPress={() => restore(item)}
            />
          </View>
        );
      }}
      ListEmptyComponent={
        <Text style={styles.empty}>
          Nothing here. Deleted decks appear here for {RESTORE_DAYS} days.
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingBottom: 48, backgroundColor: colors.background },
  help: { fontSize: 15, color: colors.muted, paddingVertical: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: touchTarget + 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  text: { flex: 1 },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  detail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  empty: { marginTop: 40, color: colors.muted, fontSize: 16, textAlign: 'center' },
});
