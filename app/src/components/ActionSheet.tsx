import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/lib/i18n';
import { colors, radius, touchTarget } from '@/lib/theme';

export type SheetOption = { label: string; onPress: () => void };

/** A bottom sheet with a few choices and Cancel (e.g. behind a "+" button). */
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
        {[...options, { label: t('common.cancel'), onPress: onClose }].map((option, i) => (
          <Pressable
            key={option.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              if (i < options.length) option.onPress();
            }}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}
          >
            <Text style={[styles.label, i === options.length && styles.cancel]} numberOfLines={2}>
              {option.label}
            </Text>
          </Pressable>
        ))}
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
  },
  option: {
    minHeight: touchTarget + 8,
    paddingHorizontal: 16,
    borderRadius: radius.button,
    justifyContent: 'center',
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
  label: { fontSize: 18, color: colors.text, fontWeight: '500' },
  cancel: { color: colors.muted },
});
