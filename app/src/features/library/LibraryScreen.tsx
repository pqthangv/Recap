import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { showSnackbar } from '@/components/Snackbar';
import { listDecks } from '@/db/decks';
import { useLive } from '@/db/live';
import { t, tn } from '@/lib/i18n';
import { type Colors, lightColors, radius, useStyles } from '@/lib/theme';

import { addPack, isPackAdded, packCardCount } from './library';
import { PACKS, type Pack } from './packs';

/** Ready-made decks to add with one tap. */
export default function LibraryScreen() {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const decks = useLive(listDecks, ['decks']);

  const open = (pack: Pack) =>
    router.push({ pathname: '/group/[name]', params: { name: pack.name } });
  const add = (pack: Pack) => {
    const { added } = addPack(pack);
    showSnackbar(t('library.added', { name: pack.name, cards: tn('count.card', added) }), {
      label: t('common.open'),
      onPress: () => open(pack),
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.help}>{t('library.help')}</Text>
      {PACKS.map((pack) => {
        const examples =
          pack.examples ?? pack.decks[0]?.cards.slice(0, 3).map((c) => c.front) ?? [];
        return (
          <View key={pack.id} style={styles.pack}>
            <View style={styles.titleRow}>
              <PackBadge pack={pack} />
              <Text style={styles.name} accessibilityRole="header">
                {pack.name}
              </Text>
            </View>
            <Text style={styles.description}>{t(pack.description)}</Text>
            <Text style={styles.meta}>
              {tn('count.deck', pack.decks.length)} · {tn('count.card', packCardCount(pack))}
              {examples.length > 0 ? ` · ${examples.join(', ')}…` : ''}
            </Text>
            {isPackAdded(pack, decks) ? (
              <Button
                variant="secondary"
                label={t('common.open')}
                accessibilityLabel={t('library.openA11y', { name: pack.name })}
                onPress={() => open(pack)}
              />
            ) : (
              <Button
                label={t('library.add')}
                accessibilityLabel={t('library.addA11y', { name: pack.name })}
                onPress={() => add(pack)}
              />
            )}
          </View>
        );
      })}
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
      <MaterialIcons name={pack.logo.icon} size={28} color={lightColors.onPrimary} />{' '}
      {/* on the pack's color */}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    content: { padding: 20, gap: 16, paddingBottom: 48 },
    help: { fontSize: 15, color: colors.muted },
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
    name: { fontSize: 19, fontWeight: '700', color: colors.text, flexShrink: 1 },
    description: { fontSize: 16, color: colors.text },
    meta: { fontSize: 14, color: colors.muted, marginBottom: 4 },
  });
