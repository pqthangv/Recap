import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import logo from '@/assets/images/logo-mark.png';
import { Button } from '@/components/Button';
import { Fab } from '@/components/Fab';
import { listDecks, listDeletedDecks } from '@/db/decks';
import { useLive } from '@/db/live';
import { getSettings, setSetting } from '@/db/settings';
import { getStudyCounts } from '@/db/study';
import { DeckRow } from '@/features/deck/DeckRow';
import { groupColor, groupCounts, groupDecks, sortDeckItems } from '@/lib/deckGroups';
import { studyButtonLabel } from '@/lib/format';
import { colors, radius, touchTarget } from '@/lib/theme';

import { AddMenu } from './AddMenu';

export default function HomeScreen() {
  const router = useRouter();
  const counts = useLive(() => getStudyCounts(), ['cards', 'decks', 'review_logs', 'settings']);
  const decks = useLive(listDecks, ['decks']);
  const sort = useLive(() => getSettings().deckSort, ['settings']);
  const deletedCount = useLive(() => listDeletedDecks().length, ['decks']);
  // Sub-decks ("SAT › Priority 1", "SAT › Priority 2") show as one "SAT" group.
  const items = sortDeckItems(groupDecks(decks), sort);
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
        <Button variant="text" label="Statistics" onPress={() => router.push('/stats')} />
        <Button variant="text" label="Settings" onPress={() => router.push('/settings')} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => (item.kind === 'deck' ? item.deck.id : `group:${item.name}`)}
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
              <View style={styles.sectionRow}>
                <Text accessibilityRole="header" style={styles.section}>
                  Decks
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Sorted by ${sort}. Sort by ${sort === 'name' ? 'color' : 'name'}`}
                  onPress={() => setSetting('deckSort', sort === 'name' ? 'color' : 'name')}
                  style={({ pressed }) => [styles.sort, pressed && styles.sortPressed]}
                >
                  <Text style={styles.sortText}>Sort: {sort === 'name' ? 'Name' : 'Color'}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          item.kind === 'deck' ? (
            <DeckRow
              name={item.deck.name}
              color={item.deck.color}
              counts={counts.byDeck[item.deck.id]}
              onPress={() => router.push({ pathname: '/deck/[id]', params: { id: item.deck.id } })}
            />
          ) : (
            <DeckRow
              name={item.name}
              color={groupColor(item.decks)}
              counts={groupCounts(item.decks, counts.byDeck, counts.new)}
              detail={`${item.decks.length} decks`}
              stacked
              onPress={() =>
                router.push({ pathname: '/group/[name]', params: { name: item.name } })
              }
            />
          )
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No decks yet. Tap + to make your first one.</Text>
        }
        ListFooterComponent={
          deletedCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/deleted')}
              style={({ pressed }) => [styles.deletedLink, pressed && styles.sortPressed]}
            >
              <Text style={styles.deletedText}>Recently deleted · {deletedCount}</Text>
            </Pressable>
          ) : null
        }
      />

      <Fab accessibilityLabel="Add a deck or card" onPress={() => setMenuOpen(true)} />
      <AddMenu visible={menuOpen} hasDecks={decks.length > 0} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
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
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  // The mark without padding (logo-mark.png), about as tall as the word.
  logo: { width: 32, height: 32 },
  // No extra font padding, so the word and the mark center on the same line.
  title: { fontSize: 28, fontWeight: '700', color: colors.text, includeFontPadding: false },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  hero: { paddingTop: 24, gap: 12 },
  caught: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  section: { fontSize: 15, fontWeight: '600', color: colors.muted },
  sort: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginRight: -12,
    borderRadius: radius.button,
  },
  sortPressed: { backgroundColor: colors.surface },
  sortText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  deletedLink: {
    minHeight: touchTarget,
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
    borderRadius: radius.button,
  },
  deletedText: { fontSize: 15, color: colors.muted },
  empty: { marginTop: 48, color: colors.muted, fontSize: 16, textAlign: 'center' },
});
