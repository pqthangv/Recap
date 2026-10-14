import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Fab } from '@/components/Fab';
import { showSnackbar } from '@/components/Snackbar';
import { deckCardsQuery, moveCards } from '@/db/cards';
import { getDeck, listDecks } from '@/db/decks';
import { useLive } from '@/db/live';
import type { Deck } from '@/db/schema';
import { getStudyCounts } from '@/db/study';
import { t, tn } from '@/lib/i18n';
import { colors, radius, touchTarget } from '@/lib/theme';

import { MoveCardsSheet } from './MoveCardsSheet';

export default function DeckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const deck = useLive(() => getDeck(id), ['decks'], id);
  const otherDecks = useLive(() => listDecks().filter((d) => d.id !== id), ['decks'], id);
  const counts = useLive(
    () => getStudyCounts().byDeck[id] ?? { due: 0, new: 0 },
    ['cards', 'decks', 'review_logs', 'settings'],
    id,
  );
  const [search, setSearch] = useState('');
  const cards = useLive(() => deckCardsQuery(id, search).all(), ['cards'], `${id}|${search}`);
  // null = normal mode; a set = choosing cards (to move them to another deck).
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [moving, setMoving] = useState(false);
  const [adding, setAdding] = useState(false);
  const toStudy = counts.due + counts.new;

  const edit = (cardId: string) => router.push({ pathname: '/card/edit', params: { id: cardId } });
  const toggle = (cardId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  const allSelected =
    selected !== null && cards.length > 0 && cards.every((c) => selected.has(c.id));

  const move = (target: Deck) => {
    if (!selected) return;
    const moved = moveCards([...selected], target.id);
    setMoving(false);
    setSelected(null);
    showSnackbar(t('deck.moved', { cards: tn('count.card', moved.length), deck: target.name }), {
      label: t('common.undo'),
      onPress: () => moveCards(moved, id),
    });
  };

  if (!deck) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={styles.empty}>{t('deck.wasDeleted')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: selected ? t('deck.selected', { n: selected.size }) : deck.name,
          headerRight: () =>
            selected ? (
              <Button variant="text" label={t('common.cancel')} onPress={() => setSelected(null)} />
            ) : (
              <View style={styles.headerButtons}>
                {cards.length > 0 ? (
                  <Button
                    variant="text"
                    label={t('common.select')}
                    accessibilityLabel={t('deck.selectA11y')}
                    onPress={() => setSelected(new Set())}
                  />
                ) : null}
                <Button
                  variant="text"
                  label={t('common.edit')}
                  accessibilityLabel={t('deck.editA11y')}
                  onPress={() => router.push({ pathname: '/deck/edit', params: { id } })}
                />
              </View>
            ),
        }}
      />
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={[styles.list, selected && { paddingBottom: 140 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets // iOS: the whole list stays reachable while searching
        ListHeaderComponent={
          <View style={styles.header}>
            {selected ? null : (
              <Button
                size="lg"
                label={toStudy > 0 ? t('deck.study', { n: toStudy }) : t('deck.nothingDueHere')}
                disabled={toStudy === 0}
                onPress={() => router.push({ pathname: '/study', params: { deckId: id } })}
              />
            )}
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('deck.search')}
              placeholderTextColor={colors.muted}
              accessibilityLabel={t('deck.search')}
              style={styles.search}
              returnKeyType="search"
              autoCorrect={false}
            />
            <View style={styles.countRow}>
              <Text style={styles.count}>{tn('count.card', cards.length)}</Text>
              {selected ? (
                <Button
                  variant="text"
                  label={t(allSelected ? 'common.deselectAll' : 'common.selectAll')}
                  onPress={() =>
                    setSelected(allSelected ? new Set() : new Set(cards.map((c) => c.id)))
                  }
                />
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) =>
          selected ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected.has(item.id) }}
              accessibilityLabel={`${item.front}. ${item.back}`}
              onPress={() => toggle(item.id)}
              style={({ pressed }) => [
                styles.card,
                styles.selectRow,
                pressed && styles.cardPressed,
              ]}
            >
              <Checkbox checked={selected.has(item.id)} />
              <View style={styles.cardText}>
                <Text style={styles.front} numberOfLines={2}>
                  {item.front}
                </Text>
                <Text style={styles.back} numberOfLines={1}>
                  {item.back}
                </Text>
              </View>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.front}. ${item.back}`}
              accessibilityHint={t('deck.cardHint')}
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
          )
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search.trim() ? t('deck.noMatch', { query: search.trim() }) : t('deck.noCards')}
          </Text>
        }
      />
      {selected ? (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 16 }]}>
          <Button
            size="lg"
            label={
              selected.size > 0
                ? t('deck.moveN', { cards: tn('count.card', selected.size) })
                : t('deck.move')
            }
            onPress={() => setMoving(true)}
            disabled={selected.size === 0}
          />
        </View>
      ) : (
        <Fab accessibilityLabel={t('deck.fab')} onPress={() => setAdding(true)} />
      )}
      <ActionSheet
        visible={adding}
        onClose={() => setAdding(false)}
        options={[
          {
            label: t('screen.addCard'),
            onPress: () => router.push({ pathname: '/card/edit', params: { deckId: id } }),
          },
          {
            label: t('deck.newInside', { name: deck.name }),
            onPress: () => router.push({ pathname: '/deck/edit', params: { parent: deck.name } }),
          },
        ]}
      />
      <MoveCardsSheet
        visible={moving}
        decks={otherDecks}
        count={selected?.size ?? 0}
        onMove={move}
        onClose={() => setMoving(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerButtons: { flexDirection: 'row' },
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
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget,
  },
  count: { fontSize: 14, color: colors.muted },
  card: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    minHeight: touchTarget,
  },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardText: { flex: 1 },
  cardPressed: { backgroundColor: colors.surface },
  front: { fontSize: 16, fontWeight: '600', color: colors.text },
  back: { fontSize: 15, color: colors.muted, marginTop: 2 },
  empty: { marginTop: 40, color: colors.muted, fontSize: 16, textAlign: 'center' },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
});
