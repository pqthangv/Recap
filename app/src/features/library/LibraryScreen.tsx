import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { syncSoon } from '@/features/sync/engine';
import { Button } from '@/components/Button';
import { showSnackbar } from '@/components/Snackbar';
import { listDecks } from '@/db/decks';
import { useLive } from '@/db/live';
import { Chip } from '@/features/import/DeckTarget';
import { t, tn, useLanguage } from '@/lib/i18n';
import { type Colors, lightColors, radius, useStyles } from '@/lib/theme';

import {
  addPack,
  isPackAdded,
  libraryCategories,
  libraryPacks,
  packCardCount,
  type LibraryFilter,
} from './library';
import { CATEGORY_NAMES, PACKS, type Pack } from './packs';

const CATEGORIES = libraryCategories(PACKS);

/** Ready-made decks to add with one tap, sorted by the chips at the top. */
export default function LibraryScreen() {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const decks = useLive(listDecks, ['decks']);
  const appLanguage = useLanguage();
  const [filter, setFilter] = useState<LibraryFilter>('all');

  const open = (pack: Pack) =>
    router.push({ pathname: '/group/[name]', params: { name: pack.name } });
  const add = (pack: Pack) => {
    const { added } = addPack(pack);
    syncSoon();
    showSnackbar(t('library.added', { name: pack.name, cards: tn('count.card', added) }), {
      label: t('common.open'),
      onPress: () => open(pack),
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* One scrolling row, so more categories never push the decks down. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chips}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('library.categoriesA11y')}
      >
        <Chip
          label={t('library.all')}
          selected={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        {CATEGORIES.map((category) => (
          <Chip
            key={category}
            label={t(CATEGORY_NAMES[category])}
            selected={filter === category}
            onPress={() => setFilter(category)}
          />
        ))}
      </ScrollView>
      {libraryPacks(PACKS, filter, appLanguage).map((pack) => (
        <View key={pack.id} style={styles.pack}>
          <View style={styles.titleRow}>
            <PackBadge pack={pack} />
            <Text style={styles.name} accessibilityRole="header">
              {pack.name}
            </Text>
          </View>
          <Text style={styles.description}>{t(pack.description)}</Text>
          {/* The button by the counts, so the name keeps the whole width in every language. */}
          <View style={styles.footer}>
            <Text style={styles.meta}>
              {tn('count.deck', pack.decks.length)} · {tn('count.card', packCardCount(pack))}
            </Text>
            {isPackAdded(pack, decks) ? (
              <Button
                variant="secondary"
                label={t('common.open')}
                accessibilityLabel={t('library.openA11y', { name: pack.name })}
                onPress={() => open(pack)}
                style={styles.button}
              />
            ) : (
              <Button
                label={t('library.add')}
                accessibilityLabel={t('library.addA11y', { name: pack.name })}
                onPress={() => add(pack)}
                style={styles.button}
              />
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/** The pack's flag or icon, in a circle. Decorative: the name next to it says what it is. */
function PackBadge({ pack }: { pack: Pack }) {
  const styles = useStyles(makeStyles);
  if ('image' in pack.logo) {
    return (
      <Image
        source={pack.logo.image}
        style={[styles.badge, styles.flag]}
        accessibilityIgnoresInvertColors
        importantForAccessibility="no"
        accessibilityElementsHidden
      />
    );
  }
  return (
    <View
      style={[styles.badge, styles.iconBadge, { backgroundColor: pack.color }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {/* White on the pack's own color, in both looks. */}
      <MaterialIcons name={pack.logo.icon} size={28} color={lightColors.onPrimary} />
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    content: { padding: 20, gap: 12, paddingBottom: 48 },
    // The chips scroll edge to edge, but start in line with the text.
    chipScroll: { marginHorizontal: -20, flexGrow: 0 },
    chips: { gap: 8, paddingHorizontal: 20 },
    pack: {
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 16,
      gap: 8,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    badge: { width: 40, height: 40, borderRadius: 20 },
    // A thin edge so white stripes don't melt into the white card.
    flag: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
    iconBadge: { alignItems: 'center', justifyContent: 'center' },
    name: { fontSize: 18, fontWeight: '700', color: colors.text, flexShrink: 1 },
    description: { fontSize: 15, color: colors.text },
    // With big system fonts the button drops below the counts, still on the right.
    footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    meta: { fontSize: 14, color: colors.muted, flexShrink: 1 },
    button: { marginLeft: 'auto' },
  });
