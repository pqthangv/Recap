import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Fab } from '@/components/Fab';
import { countCards } from '@/db/cards';
import { deleteDecks, listDecks, RESTORE_DAYS } from '@/db/decks';
import { useLive } from '@/db/live';
import { getSettings } from '@/db/settings';
import { getStudyCounts } from '@/db/study';
import { decksInGroup, groupCounts, nameInGroup, sortDecks } from '@/lib/deckGroups';
import { t, tn } from '@/lib/i18n';
import { type Colors, useStyles } from '@/lib/theme';
import { showAlert } from '@/lib/alert';

import { DeckRow } from './DeckRow';

/** A deck group ("SAT › Priority 1", "SAT › Priority 2", …): study them all, open one, or delete all. */
export default function DeckGroupScreen() {
  const styles = useStyles(makeStyles);
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const sort = useLive(() => getSettings().deckSort, ['settings']);
  const decks = sortDecks(
    useLive(() => decksInGroup(listDecks(), name), ['decks'], name),
    sort,
  );
  const counts = useLive(() => getStudyCounts(), ['cards', 'decks', 'review_logs', 'settings']);
  const total = groupCounts(decks, counts.byDeck, counts.new);
  const toStudy = total.due + total.new;

  const confirmDelete = () => {
    const ids = decks.map((d) => d.id);
    const cards = countCards(ids);
    showAlert(
      t('group.deleteTitle', { decks: tn('count.deck', decks.length) }),
      t('group.deleteBody', { name, cards: tn('count.card', cards), days: RESTORE_DAYS }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteDecks(ids);
            router.dismissTo('/');
          },
        },
      ],
    );
  };

  if (decks.length === 0) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={styles.empty}>{t('group.wasDeleted')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: name }} />
      <FlatList
        data={decks}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button
              size="lg"
              label={toStudy > 0 ? t('group.studyAll', { n: toStudy }) : t('group.nothingDue')}
              disabled={toStudy === 0}
              onPress={() => router.push({ pathname: '/study', params: { group: name } })}
            />
            <Text accessibilityRole="header" style={styles.section}>
              {tn('count.deck', decks.length)}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <DeckRow
            name={nameInGroup(item.name)}
            color={item.color}
            counts={counts.byDeck[item.id]}
            onPress={() => router.push({ pathname: '/deck/[id]', params: { id: item.id } })}
          />
        )}
        ListFooterComponent={
          <Button
            variant="danger"
            label={t('group.deleteAll', { decks: tn('count.deck', decks.length) })}
            onPress={confirmDelete}
            style={styles.delete}
          />
        }
      />
      <Fab
        accessibilityLabel={t('group.fab', { name })}
        onPress={() => router.push({ pathname: '/deck/edit', params: { parent: name } })}
      />
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    list: { paddingHorizontal: 20, paddingBottom: 120 },
    header: { gap: 12, paddingTop: 8 },
    section: {
      marginTop: 12,
      marginBottom: 4,
      fontSize: 15,
      fontWeight: '600',
      color: colors.muted,
    },
    delete: { marginTop: 32 },
    empty: { marginTop: 40, color: colors.muted, fontSize: 16, textAlign: 'center' },
  });
