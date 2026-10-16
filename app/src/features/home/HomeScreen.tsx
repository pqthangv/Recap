import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import logo from '@/assets/images/logo-mark.png';
import { Button } from '@/components/Button';
import { Fab } from '@/components/Fab';
import { listDecks, listDeletedDecks } from '@/db/decks';
import { useLive } from '@/db/live';
import { getSettings, setSetting } from '@/db/settings';
import { getStudyCounts } from '@/db/study';
import { DeckRow } from '@/features/deck/DeckRow';
import { endTutorial, getTutorialDeckId } from '@/features/onboarding/tutorial';
import { TutorialTip } from '@/features/onboarding/TutorialTip';
import { PLAY_STORE_URL, PRIVACY_POLICY_URL, SUPPORT_URL } from '@/lib/contact';
import { groupColor, groupCounts, groupDecks, sortDeckItems } from '@/lib/deckGroups';
import { studyButtonLabel } from '@/lib/format';
import { t, tn } from '@/lib/i18n';
import { isWeb } from '@/lib/platform';
import { type Colors, radius, touchTarget, useStyles } from '@/lib/theme';

import { AddMenu } from './AddMenu';

export default function HomeScreen() {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const counts = useLive(() => getStudyCounts(), ['cards', 'decks', 'review_logs', 'settings']);
  const decks = useLive(listDecks, ['decks']);
  const sort = useLive(() => getSettings().deckSort, ['settings']);
  const deletedCount = useLive(() => listDeletedDecks().length, ['decks']);
  // First launch only: a tip above "How to use Recap" (Start / Skip).
  const tutorialDeck = useLive(getTutorialDeckId, ['settings', 'decks']);
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
        <View style={styles.links}>
          <Button
            variant="text"
            label={t('screen.library')}
            onPress={() => router.push('/library')}
            style={styles.link}
          />
          <Button
            variant="text"
            label={t('screen.stats')}
            onPress={() => router.push('/stats')}
            style={styles.link}
          />
          <Button
            variant="text"
            label={t('screen.settings')}
            onPress={() => router.push('/settings')}
            style={styles.link}
          />
        </View>
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
              <Text style={styles.caught}>{t('home.caughtUp')}</Text>
            ) : null}
            {decks.length > 0 ? (
              <View style={styles.sectionRow}>
                <Text accessibilityRole="header" style={styles.section}>
                  {t('home.decks')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('home.sortA11y', {
                    current: t(sort === 'name' ? 'home.sortNameLower' : 'home.sortColorLower'),
                    next: t(sort === 'name' ? 'home.sortColorLower' : 'home.sortNameLower'),
                  })}
                  onPress={() => setSetting('deckSort', sort === 'name' ? 'color' : 'name')}
                  style={({ pressed }) => [styles.sort, pressed && styles.sortPressed]}
                >
                  <Text style={styles.sortText}>
                    {t('home.sortLabel', {
                      by: t(sort === 'name' ? 'home.sortName' : 'home.sortColor'),
                    })}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          item.kind === 'deck' ? (
            <>
              {item.deck.id === tutorialDeck ? (
                <TutorialTip
                  onStart={() => {
                    endTutorial();
                    router.push({ pathname: '/study', params: { deckId: item.deck.id } });
                  }}
                  onSkip={() => endTutorial()}
                />
              ) : null}
              <DeckRow
                name={item.deck.name}
                color={item.deck.color}
                counts={counts.byDeck[item.deck.id]}
                highlighted={item.deck.id === tutorialDeck}
                onPress={() => {
                  if (item.deck.id === tutorialDeck) endTutorial();
                  router.push({ pathname: '/deck/[id]', params: { id: item.deck.id } });
                }}
              />
            </>
          ) : (
            <DeckRow
              name={item.name}
              color={groupColor(item.decks)}
              counts={groupCounts(item.decks, counts.byDeck, counts.new)}
              detail={tn('count.deck', item.decks.length)}
              stacked
              onPress={() =>
                router.push({ pathname: '/group/[name]', params: { name: item.name } })
              }
            />
          )
        }
        ListEmptyComponent={<Text style={styles.empty}>{t('home.empty')}</Text>}
        ListFooterComponent={
          <>
            {deletedCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/deleted')}
                style={({ pressed }) => [styles.deletedLink, pressed && styles.sortPressed]}
              >
                <Text style={styles.deletedText}>
                  {t('home.recentlyDeleted', { n: deletedCount })}
                </Text>
              </Pressable>
            ) : null}
            {isWeb ? <WebLinks /> : null}
          </>
        }
      />

      <Fab accessibilityLabel={t('home.fab')} onPress={() => setMenuOpen(true)} />
      <AddMenu visible={menuOpen} hasDecks={decks.length > 0} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  );
}

/** The website's footer: the phone app, help and the privacy policy. */
function WebLinks() {
  const styles = useStyles(makeStyles);
  const links = [
    { label: t('home.getAndroid'), url: PLAY_STORE_URL },
    { label: t('settings.help'), url: SUPPORT_URL },
    { label: t('settings.privacy'), url: PRIVACY_POLICY_URL },
  ];
  return (
    <View style={styles.webLinks}>
      {links.map((link) => (
        <Pressable
          key={link.url}
          accessibilityRole="link"
          onPress={() => Linking.openURL(link.url)}
          style={({ pressed }) => [styles.webLink, pressed && styles.sortPressed]}
        >
          <Text style={styles.webLinkText}>{link.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    // With large system text the links move to a second line instead of covering the title.
    header: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      paddingLeft: 20,
      paddingRight: 14, // + the links' 6 = the screen's 20
      paddingTop: 8,
    },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    links: { flexDirection: 'row', marginLeft: 'auto' },
    // Close together, so the three read as one group, apart from the title (still ≥ 48dp each).
    link: { paddingHorizontal: 6 },
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
    webLinks: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      marginTop: 32,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
    },
    webLink: {
      minHeight: touchTarget,
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: radius.button,
    },
    webLinkText: { fontSize: 14, color: colors.primary },
    empty: { marginTop: 48, color: colors.muted, fontSize: 16, textAlign: 'center' },
  });
