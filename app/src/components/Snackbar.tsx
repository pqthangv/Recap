import { useEffect } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { t } from '@/lib/i18n';
import { type Colors, sideSpace, touchTarget, useStyles } from '@/lib/theme';

type Snack = { id: number; message: string; actionLabel?: string; onAction?: () => void };

const useSnackbar = create<{ snack: Snack | null }>(() => ({ snack: null }));

let nextId = 1;

/** Show a short message at the bottom of the screen, optionally with an action like "Undo". */
export function showSnackbar(message: string, action?: { label: string; onPress: () => void }) {
  useSnackbar.setState({
    snack: { id: nextId++, message, actionLabel: action?.label, onAction: action?.onPress },
  });
  AccessibilityInfo.announceForAccessibility(
    action ? t('snackbar.actionAvailable', { message, action: action.label }) : message,
  );
}

export function hideSnackbar() {
  useSnackbar.setState({ snack: null });
}

const VISIBLE_MS = 6000;
// Sits above the round + button (64dp, 24dp from the bottom) so both stay tappable.
const SNACKBAR_OFFSET = 104;

/** Rendered once, in the root layout. */
export function SnackbarHost() {
  const styles = useStyles(makeStyles);
  const snack = useSnackbar((s) => s.snack);
  const insets = useSafeAreaInsets();
  const side = 16 + sideSpace(useWindowDimensions().width);

  useEffect(() => {
    if (!snack) return;
    const timer = setTimeout(() => {
      if (useSnackbar.getState().snack?.id === snack.id) hideSnackbar();
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [snack]);

  if (!snack) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + SNACKBAR_OFFSET, left: side, right: side }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.bar}>
        <Text style={styles.message}>{snack.message}</Text>
        {snack.actionLabel ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              hideSnackbar();
              snack.onAction?.();
            }}
            style={styles.action}
          >
            <Text style={styles.actionText}>{snack.actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    wrap: { position: 'absolute' },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.text,
      borderRadius: 12,
      paddingLeft: 16,
      paddingRight: 4,
      minHeight: touchTarget + 8,
    },
    message: { flex: 1, color: colors.background, fontSize: 15, paddingVertical: 12 },
    action: {
      minHeight: touchTarget,
      minWidth: touchTarget,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionText: { color: colors.tint, fontSize: 15, fontWeight: '700' },
  });
