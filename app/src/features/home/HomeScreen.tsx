import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import logo from '@/assets/images/splash-icon.png';
import { Button } from '@/components/Button';
import { Fab } from '@/components/Fab';
import { listDecks } from '@/db/decks';
import { useLive } from '@/db/live';
import type { Deck } from '@/db/schema';
import { getStudyCounts, type DeckCounts } from '@/db/study';
import { studyButtonLabel } from '@/lib/format';
import { colors, radius, touchTarget } from '@/lib/theme';

import { AddMenu } from './AddMenu';

export default function HomeScreen() {
  const router = useRouter();
  const counts = useLive(() => getStudyCounts(), ['cards', 'decks', 'review_logs', 'settings']);
  const decks = useLive(listDecks, ['decks']);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <Image source={logo} style={styles.logo} accessibilityIgnoresInvertColors />
          <Text accessibilityRole="header" style={styles.title}>
            Recap
          </Text>
        </View>
        <Button variant="text" label="Stats" onPress={() => router.push('/stats')} />
        <Button variant="text" label="Settings" onPress={() => router.push('/settings')} />
      </View>

      <FlatList
        data={decks}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.hero}>
            <Button
              size="lg"
              label={studyButtonLabel(counts.total)}
              disabled={counts.total === 0}
              onPress={() => router.push('/study')}
            />
            {counts.total === 0 && decks.length > 0 ? (
              <Text style={styles.caught}>All caught up. See you tomorrow.</Text>
            ) : null}
            {decks.length > 0 ? (
              <Text accessibilityRole="header" style={styles.section}>
                Decks
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <DeckRow
            deck={item}
            counts={counts.byDeck[item.id]}
            onPress={() => router.push({ pathname: '/deck/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No decks yet. Tap + to make your first one.</Text>
        }
      />

      <Fab accessibilityLabel="Add a deck or card" onPress={() => setMenuOpen(true)} />
      <AddMenu visible={menuOpen} hasDecks={decks.length > 0} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  );
}

function DeckRow({
  deck,
  counts = { due: 0, new: 0 },
  onPress,
}: {
  deck: Deck;
  counts?: DeckCounts;
  onPress: () => void;
}) {
  const summary =
    counts.due + counts.new === 0 ? 'Nothing due' : `${counts.due} due · ${counts.new} new`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${deck.name}, ${summary}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.dot, { backgroundColor: deck.color }]} />
      <View style={styles.rowText}>
        <Text style={styles.deckName}>{deck.name}</Text>
        <Text style={styles.deckCounts}>{summary}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 8,
    paddingTop: 8,
  },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 40, height: 40 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  hero: { paddingTop: 24, gap: 12 },
  caught: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  section: { marginTop: 20, marginBottom: 4, fontSize: 15, fontWeight: '600', color: colors.muted },
  empty: { marginTop: 48, color: colors.muted, fontSize: 16, textAlign: 'center' },
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
  dot: { width: 14, height: 14, borderRadius: 7 },
  rowText: { flex: 1 },
  deckName: { fontSize: 17, fontWeight: '600', color: colors.text },
  deckCounts: { fontSize: 14, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 26, color: colors.muted },
});
