import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { SideLanguages } from '@/components/SideLanguages';
import { countCards } from '@/db/cards';
import { createDeck, deleteDeck, getDeck, listDecks, RESTORE_DAYS, updateDeck } from '@/db/decks';
import { childDeckName } from '@/lib/deckGroups';
import { t, tn } from '@/lib/i18n';
import { cardSideLanguages, type SideLanguages as Languages } from '@/lib/language';
import { colors, deckColors, radius, touchTarget } from '@/lib/theme';
import { showAlert } from '@/lib/alert';

/**
 * New deck, or edit an existing one when opened with `?id=`. With `?parent=` the new deck goes
 * inside that deck or group ("SAT" → "SAT › Week 1") and starts with the parent's color.
 */
export default function DeckFormScreen() {
  const { id, parent } = useLocalSearchParams<{ id?: string; parent?: string }>();
  const router = useRouter();
  const [existing] = useState(() => (id ? getDeck(id) : undefined));
  const inside = !existing && parent?.trim() ? parent.trim() : null;
  // A new deck inside another starts with that deck's color and languages.
  const [parentDeck] = useState(() =>
    inside ? listDecks().find((d) => d.name.trim().toLowerCase() === inside.toLowerCase()) : null,
  );
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState<string>(
    () => existing?.color ?? parentDeck?.color ?? deckColors[0],
  );
  const [languages, setLanguages] = useState<Languages>(() =>
    cardSideLanguages(existing ?? parentDeck ?? undefined, false),
  );
  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    if (existing) {
      updateDeck(existing.id, { name, color, languages });
      router.back();
    } else {
      const deck = createDeck({
        name: inside ? childDeckName(inside, name) : name,
        color,
        languages,
      });
      router.replace({ pathname: '/deck/[id]', params: { id: deck.id } });
    }
  };

  const confirmDelete = () => {
    if (!existing) return;
    const n = countCards(existing.id);
    showAlert(
      t('deck.deleteTitle'),
      t('deck.deleteBody', { name: existing.name, cards: tn('count.card', n), days: RESTORE_DAYS }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteDeck(existing.id);
            router.dismissTo('/');
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets // iOS: scroll fields above the keyboard
    >
      <Stack.Screen options={{ title: t(existing ? 'screen.editDeck' : 'screen.newDeck') }} />
      {inside ? <Text style={styles.inside}>{t('deck.inside', { name: inside })}</Text> : null}
      <Text style={styles.label}>{t('deck.name')}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t(inside ? 'deck.namePlaceholderInside' : 'deck.namePlaceholder')}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t('deck.nameA11y')}
        autoFocus={!existing}
        returnKeyType="done"
        onSubmitEditing={save}
        style={styles.input}
        maxLength={80}
      />

      <Text style={styles.label}>{t('deck.color')}</Text>
      <View style={styles.colors} accessibilityRole="radiogroup">
        {deckColors.map((c, i) => (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityLabel={t('deck.colorN', { n: i + 1 })}
            accessibilityState={{ checked: c === color }}
            onPress={() => setColor(c)}
            style={[styles.swatchHit, c === color && styles.swatchSelected]}
          >
            <View style={[styles.swatch, { backgroundColor: c }]} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t('deck.readAloudIn')}</Text>
      <SideLanguages
        value={languages}
        onChange={(side, language) => setLanguages((l) => ({ ...l, [side]: language }))}
        titles={{ front: t('deck.frontLanguageTitle'), back: t('deck.backLanguageTitle') }}
        autoOption={t('deck.languageAutoOption')}
      />
      <Text style={styles.help}>{t('deck.languagesHelp')}</Text>

      <Button label={t('common.save')} onPress={save} disabled={!canSave} style={styles.save} />
      {existing ? (
        <Button variant="danger" label={t('deck.delete')} onPress={confirmDelete} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 8 },
  label: { fontSize: 15, fontWeight: '600', color: colors.muted, marginTop: 8 },
  inside: { fontSize: 16, color: colors.text },
  help: { fontSize: 14, color: colors.muted },
  input: {
    minHeight: touchTarget,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: 17,
    color: colors.text,
  },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  swatchHit: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: { borderColor: colors.text },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  save: { marginTop: 24 },
});
