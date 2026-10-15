import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t, type StringKey } from '@/lib/i18n';
import {
  CARD_LANGUAGES,
  cardLanguageName,
  type CardLanguage,
  type SideLanguages as Languages,
} from '@/lib/language';
import { colors, radius, touchTarget } from '@/lib/theme';

import { ActionSheet } from './ActionSheet';

type Side = keyof Languages;
const SIDES: readonly Side[] = ['front', 'back'];
const SIDE_TEXT: Record<Side, { label: StringKey; a11y: StringKey }> = {
  front: { label: 'languages.front', a11y: 'languages.frontA11y' },
  back: { label: 'languages.back', a11y: 'languages.backA11y' },
};

const nameOf = (code: CardLanguage | null) => cardLanguageName(code) ?? t('languages.auto');

type Props = {
  value: Languages;
  onChange: (side: Side, language: CardLanguage | null) => void;
  /** The list's heading for each side, e.g. "Write the front of the cards in". */
  titles: Record<Side, string>;
  /** The Auto choice at the top of the list, e.g. "Auto: the language you wrote in". */
  autoOption: string;
  disabled?: boolean;
};

/**
 * "Front: Auto ⌄ · Back: Auto ⌄": a language for each side of the cards (Create with AI, a
 * deck's Read aloud). Tapping a side opens the list, Auto first.
 */
export function SideLanguages({ value, onChange, titles, autoOption, disabled }: Props) {
  const [side, setSide] = useState<Side>('front');
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.row}>
      {SIDES.map((s) => (
        <Pressable
          key={s}
          accessibilityRole="button"
          accessibilityLabel={t(SIDE_TEXT[s].a11y, { language: nameOf(value[s]) })}
          disabled={disabled}
          onPress={() => {
            setSide(s);
            setOpen(true);
          }}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.text} numberOfLines={2}>
            {t(SIDE_TEXT[s].label, { language: nameOf(value[s]) })}
          </Text>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>
      ))}
      <ActionSheet
        visible={open}
        title={titles[side]}
        options={[{ code: null, name: autoOption }, ...CARD_LANGUAGES].map(({ code, name }) => ({
          label: name,
          selected: value[side] === code,
          onPress: () => onChange(side, code),
        }))}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  button: {
    flex: 1,
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
  },
  text: { flexShrink: 1, fontSize: 15, color: colors.text },
  chevron: { fontSize: 15, color: colors.muted },
  pressed: { opacity: 0.7 },
});
