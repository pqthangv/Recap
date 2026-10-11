import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Fab } from '@/components/Fab';
import { deckCardsQuery } from '@/db/cards';
import { getDeck } from '@/db/decks';
import { useLive } from '@/db/live';
import { getStudyCounts } from '@/db/study';
import { plural } from '@/lib/format';
import { colors, radius, touchTarget } from '@/lib/theme';

export default function DeckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const deck = useLive(() => getDeck(id), ['decks'], id);
  const counts = useLive(
    () => getStudyCounts().byDeck[id] ?? { due: 0, new: 0 },
    ['cards', 'decks', 'review_logs', 'settings'],
    id,
  );
  const [search, setSearch] = useState('');
  const { data: cards } = useLiveQuery(deckCardsQuery(id, search), [id, search]);
  const toStudy = counts.due + counts.new;

  const edit = (cardId: string) => router.push({ pathname: '/card/edit', params: { id: cardId } });

  if (!deck) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={styles.empty}>This deck was deleted.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: deck.name,
          headerRight: () => (
            <Button
              variant="text"
              label="Edit"
              accessibilityLabel="Edit deck"
              onPress={() => router.push({ pathname: '/deck/edit', params: { id } })}
            />
          ),
        }}
      />
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Button
              size="lg"
              label={toStudy > 0 ? `Study this deck · ${toStudy}` : 'Nothing due in this deck'}
              disabled={toStudy === 0}
              onPress={() => router.push({ pathname: '/study', params: { deckId: id } })}
            />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search cards"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Search cards"
              style={styles.search}
              returnKeyType="search"
              autoCorrect={false}
            />
            <Text style={styles.count}>{plural(cards.length, 'card')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.front}. ${item.back}`}
            accessibilityHint="Double tap to edit or delete"
            onPress={() => edit(item.id)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <Text style={styles.front} numberOfLines={2}>
              {item.front}
            </Text>
            <Text style={styles.back} numberOfLines={1}>
              {item.back}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search.trim()
              ? `No cards match "${search.trim()}".`
              : 'No cards yet. Tap + to add one.'}
          </Text>
        }
      />
      <Fab
        accessibilityLabel="Add card"
        onPress={() => router.push({ pathname: '/card/edit', params: { deckId: id } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  header: { gap: 12, paddingTop: 8, paddingBottom: 4 },
  search: {
    minHeight: touchTarget,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
  },
  count: { fontSize: 14, color: colors.muted },
  card: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    minHeight: touchTarget,
  },
  cardPressed: { backgroundColor: colors.surface },
  front: { fontSize: 16, fontWeight: '600', color: colors.text },
  back: { fontSize: 15, color: colors.muted, marginTop: 2 },
  empty: { marginTop: 40, color: colors.muted, fontSize: 16, textAlign: 'center' },
});
