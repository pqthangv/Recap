import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Fab } from '@/components/Fab';
import { countCards } from '@/db/cards';
import { deleteDecks, listDecks } from '@/db/decks';
import { useLive } from '@/db/live';
import { getSettings } from '@/db/settings';
import { getStudyCounts } from '@/db/study';
import { decksInGroup, groupCounts, nameInGroup, sortDecks } from '@/lib/deckGroups';
import { plural } from '@/lib/format';
import { colors } from '@/lib/theme';

import { DeckRow } from './DeckRow';

/** A deck group ("SAT › Priority 1", "SAT › Priority 2", …): study them all, open one, or delete all. */
export default function DeckGroupScreen() {
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
    Alert.alert(
      `Delete ${plural(decks.length, 'deck')}?`,
      `All decks in "${name}" and their ${plural(cards, 'card')} will be deleted. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
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
        <Text style={styles.empty}>These decks were deleted.</Text>
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
              label={toStudy > 0 ? `Study all · ${toStudy}` : 'Nothing due in these decks'}
              disabled={toStudy === 0}
              onPress={() => router.push({ pathname: '/study', params: { group: name } })}
            />
            <Text accessibilityRole="header" style={styles.section}>
              {plural(decks.length, 'deck')}
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
            label={`Delete all ${plural(decks.length, 'deck')}`}
            onPress={confirmDelete}
            style={styles.delete}
          />
        }
      />
      <Fab
        accessibilityLabel={`New deck in ${name}`}
        onPress={() => router.push({ pathname: '/deck/edit', params: { parent: name } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  header: { gap: 12, paddingTop: 8 },
  section: { marginTop: 12, marginBottom: 4, fontSize: 15, fontWeight: '600', color: colors.muted },
  delete: { marginTop: 32 },
  empty: { marginTop: 40, color: colors.muted, fontSize: 16, textAlign: 'center' },
});
