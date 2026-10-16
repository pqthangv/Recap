import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { showSnackbar } from '@/components/Snackbar';
import { listDeletedDecks, RESTORE_DAYS, restoreDecks, type DeletedDeck } from '@/db/decks';
import { useLive } from '@/db/live';
import { groupColor, groupDecks, type DeckListItem } from '@/lib/deckGroups';
import { daysAgo } from '@/lib/format';
import { t, tn } from '@/lib/i18n';
import { type Colors, touchTarget, useStyles } from '@/lib/theme';

/** Decks deleted in the last 30 days, with Restore. A deleted group shows as one row. */
export default function DeletedDecksScreen() {
  const styles = useStyles(makeStyles);
  // "now" is read with the list, so "deleted today" stays right after midnight on refresh.
  const { deleted, now } = useLive(
    () => ({ deleted: listDeletedDecks(), now: Date.now() }),
    ['decks', 'cards'],
  );
  const items = groupDecks(deleted);

  const restore = (item: DeckListItem<DeletedDeck>) => {
    const decks = item.kind === 'deck' ? [item.deck] : item.decks;
    restoreDecks(decks.map((d) => d.id));
    showSnackbar(
      t('deleted.restored', { name: item.kind === 'deck' ? item.deck.name : item.name }),
    );
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => (item.kind === 'deck' ? item.deck.id : `group:${item.name}`)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <Text style={styles.help}>{t('deleted.help', { days: RESTORE_DAYS })}</Text>
      }
      renderItem={({ item }) => {
        const decks = item.kind === 'deck' ? [item.deck] : item.decks;
        const name = item.kind === 'deck' ? item.deck.name : item.name;
        const cardCount = decks.reduce((n, d) => n + d.cards, 0);
        const latest = Math.max(...decks.map((d) => d.deleted_at));
        const detail = [
          item.kind === 'group' ? tn('count.deck', decks.length) : null,
          tn('count.card', cardCount),
          t('deleted.when', { when: daysAgo(latest, now) }),
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
              label={t(item.kind === 'group' ? 'deleted.restoreAll' : 'deleted.restore')}
              accessibilityLabel={t('deleted.restoreA11y', { name })}
              onPress={() => restore(item)}
            />
          </View>
        );
      }}
      ListEmptyComponent={
        <Text style={styles.empty}>{t('deleted.empty', { days: RESTORE_DAYS })}</Text>
      }
    />
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
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
