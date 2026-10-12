import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import logo from '@/assets/images/splash-icon.png';
import { Button } from '@/components/Button';
import { Fab } from '@/components/Fab';
import { listDecks } from '@/db/decks';
import { useLive } from '@/db/live';
import { getStudyCounts } from '@/db/study';
import { DeckRow } from '@/features/deck/DeckRow';
import { groupCounts, groupDecks } from '@/lib/deckGroups';
import { studyButtonLabel } from '@/lib/format';
import { colors } from '@/lib/theme';

import { AddMenu } from './AddMenu';

export default function HomeScreen() {
  const router = useRouter();
  const counts = useLive(() => getStudyCounts(), ['cards', 'decks', 'review_logs', 'settings']);
  const decks = useLive(listDecks, ['decks']);
  // Sub-decks ("SAT › Priority 1", "SAT › Priority 2") show as one "SAT" group.
  const items = groupDecks(decks);
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
              <Text accessibilityRole="header" style={styles.section}>
                Decks
              </Text>
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
              color={item.decks[0].color}
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
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 40, height: 40 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  hero: { paddingTop: 24, gap: 12 },
  caught: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  section: { marginTop: 20, marginBottom: 4, fontSize: 15, fontWeight: '600', color: colors.muted },
  empty: { marginTop: 48, color: colors.muted, fontSize: 16, textAlign: 'center' },
});
