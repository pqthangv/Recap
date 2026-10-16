import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ImportTarget } from '@/db/import';
import type { Deck } from '@/db/schema';
import { t } from '@/lib/i18n';
import { useScheme } from '@/lib/appearance';
import {
  type Colors,
  radius,
  shownDeckColor,
  touchTarget,
  useColors,
  useStyles,
} from '@/lib/theme';

type Props = {
  value: ImportTarget;
  onChange: (target: ImportTarget) => void;
  decks: readonly Deck[];
  /** Offer "decks from the file" with this label (CSV deck column, Anki decks). */
  fromFile?: { label: string; fallbackName: string };
  suggestedName: string;
};

/** "Add to": decks from the file, a new deck (with a name), or an existing deck. */
export function DeckTarget({ value, onChange, decks, fromFile, suggestedName }: Props) {
  const styles = useStyles(makeStyles);
  const colors = useColors();
  const newName = value.kind === 'new' ? value.name : suggestedName;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('import.addTo')}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {fromFile ? (
          <Chip
            label={fromFile.label}
            selected={value.kind === 'fromFile'}
            onPress={() => onChange({ kind: 'fromFile', fallbackName: fromFile.fallbackName })}
          />
        ) : null}
        <Chip
          label={t('import.newDeck')}
          selected={value.kind === 'new'}
          onPress={() => onChange({ kind: 'new', name: newName })}
        />
      </View>
      {value.kind === 'new' ? (
        <TextInput
          value={value.name}
          onChangeText={(name) => onChange({ kind: 'new', name })}
          placeholder={t('import.deckName')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('import.newDeckA11y')}
          style={styles.input}
          maxLength={80}
        />
      ) : null}
      {decks.length > 0 ? (
        // One scrolling row (like the card editor), so many decks don't push everything down.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.deckRow}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('import.yourDecks')}
        >
          {decks.map((d) => (
            <Chip
              key={d.id}
              label={d.name}
              color={d.color}
              selected={value.kind === 'existing' && value.deckId === d.id}
              onPress={() => onChange({ kind: 'existing', deckId: d.id })}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
}) {
  const styles = useStyles(makeStyles);
  const scheme = useScheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {color ? (
        <View style={[styles.dot, { backgroundColor: shownDeckColor(color, scheme) }]} />
      ) : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    label: { fontSize: 15, fontWeight: '600', color: colors.muted },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    deckRow: { gap: 8, paddingRight: 20 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: touchTarget,
      maxWidth: '100%',
      paddingHorizontal: 16,
      borderRadius: radius.chip,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    chipSelected: { backgroundColor: colors.tint, borderColor: colors.primary },
    chipText: { fontSize: 15, color: colors.text, flexShrink: 1 },
    chipTextSelected: { color: colors.primary, fontWeight: '600' },
    dot: { width: 10, height: 10, borderRadius: 5 },
    input: {
      minHeight: touchTarget,
      borderRadius: radius.button,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      fontSize: 17,
      color: colors.text,
    },
  });
