import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/lib/i18n';
import { colors, radius, touchTarget } from '@/lib/theme';

export type SheetOption = {
  label: string;
  onPress: () => void;
  /** Set on every option of a pick-one list: the current choice gets a tick. */
  selected?: boolean;
};

/** A bottom sheet with choices and Cancel (e.g. behind a "+" button). Long lists scroll. */
export function ActionSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  /** Optional line above the choices, e.g. "Why are you reporting this card?". */
  title?: string;
  options: readonly SheetOption[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.closeMenu')}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {title ? (
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        <ScrollView style={styles.list} bounces={false}>
          {options.map((option) => (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              accessibilityState={
                option.selected === undefined ? undefined : { selected: option.selected }
              }
              onPress={() => {
                onClose();
                option.onPress();
              }}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            >
              <Text style={[styles.label, option.selected && styles.selected]} numberOfLines={2}>
                {option.label}
              </Text>
              {option.selected ? (
                <Text style={[styles.label, styles.selected]} importantForAccessibility="no">
                  ✓
                </Text>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.option, pressed && styles.pressed]}
        >
          <Text style={[styles.label, styles.cancel]}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(26, 21, 48, 0.35)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingTop: 12,
    paddingHorizontal: 12,
    maxHeight: '85%',
  },
  list: { flexGrow: 0, flexShrink: 1 },
  option: {
    minHeight: touchTarget + 8,
    paddingHorizontal: 16,
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 15,
    color: colors.muted,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  pressed: { backgroundColor: colors.surface },
  label: { flexShrink: 1, fontSize: 18, color: colors.text, fontWeight: '500' },
  selected: { color: colors.primary, fontWeight: '700' },
  cancel: { color: colors.muted },
});
