import { useRouter, type Href } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, touchTarget } from '@/lib/theme';

type Props = { visible: boolean; hasDecks: boolean; onClose: () => void };

/** Bottom sheet behind the home screen's "+" button. */
export function AddMenu({ visible, hasDecks, onClose }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const go = (href: Href) => {
    onClose();
    router.push(href);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Option label="New deck" onPress={() => go('/deck/edit')} />
        <Option
          label="Add card"
          hint={hasDecks ? undefined : 'Make a deck first'}
          disabled={!hasDecks}
          onPress={() => go('/card/edit')}
        />
        <Option label="Create with AI" hint="Coming soon" disabled onPress={onClose} />
        <Option label="Cancel" onPress={onClose} muted />
      </View>
    </Modal>
  );
}

function Option({
  label,
  hint,
  disabled,
  muted,
  onPress,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <Text style={[styles.label, disabled && styles.disabled, muted && styles.muted]}>
        {label}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pressed: { backgroundColor: colors.surface },
  label: { fontSize: 18, color: colors.text, fontWeight: '500' },
  disabled: { color: colors.muted },
  muted: { color: colors.muted },
  hint: {
    fontSize: 13,
    color: colors.primary,
    backgroundColor: colors.tint,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.chip,
    overflow: 'hidden',
  },
});
