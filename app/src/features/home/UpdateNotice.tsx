// "Recap 1.0.8 is out   Update   ✕" under the Study button (lib/updates.ts): one quiet line; its
// ✕ hides it until the next version. "Update" opens Google Play or the App Store. iPhones only
// see it once version.json lists "ios" (added after an App Store build with this is live).
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { nativeApplicationVersion } from 'expo-application';
import { useEffect } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLive } from '@/db/live';
import { getRawSetting, setRawSetting } from '@/db/settings';
import { showAlert } from '@/lib/alert';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/contact';
import { type StringKey, t } from '@/lib/i18n';
import { UPDATE_CHECKED_KEY, UPDATE_HIDDEN_KEY, UPDATE_LATEST_KEY } from '@/lib/settings';
import { type Colors, radius, touchTarget, useColors, useStyles } from '@/lib/theme';
import { dueForCheck, fetchLatestVersion, noticeVersion, type StorePlatform } from '@/lib/updates';

type Store = { platform: StorePlatform; url: string; a11y: StringKey };

const STORE: Store | null =
  Platform.OS === 'android'
    ? { platform: 'android', url: PLAY_STORE_URL, a11y: 'update.a11yPlay' }
    : Platform.OS === 'ios'
      ? { platform: 'ios', url: APP_STORE_URL, a11y: 'update.a11yAppStore' }
      : null;

/** Reads version.json if a day has passed since the last time. Offline: next time. */
async function checkForUpdate(store: Store, now = Date.now()): Promise<void> {
  if (!dueForCheck(getRawSetting(UPDATE_CHECKED_KEY), now)) return;
  const latest = await fetchLatestVersion(store.platform);
  if (latest === null) return;
  setRawSetting(UPDATE_LATEST_KEY, latest, now);
  setRawSetting(UPDATE_CHECKED_KEY, now, now);
}

export function UpdateNotice() {
  const styles = useStyles(makeStyles);
  const colors = useColors();
  const version = useLive(
    () =>
      noticeVersion(
        getRawSetting(UPDATE_LATEST_KEY),
        nativeApplicationVersion,
        getRawSetting(UPDATE_HIDDEN_KEY),
      ),
    ['settings'],
  );
  useEffect(() => {
    if (STORE) void checkForUpdate(STORE);
  }, []);

  if (!STORE || !version) return null;
  const store = STORE;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t(store.a11y, { version })}
        onPress={() =>
          Linking.openURL(store.url).catch(() => showAlert(t('update.action'), store.url))
        }
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      >
        <Text style={styles.text}>{t('update.available', { version })}</Text>
        <Text style={styles.action}>{t('update.action')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('update.hide')}
        onPress={() => setRawSetting(UPDATE_HIDDEN_KEY, version)}
        style={({ pressed }) => [styles.hide, pressed && styles.pressed]}
      >
        <MaterialIcons
          name="close"
          size={20}
          color={colors.muted}
          importantForAccessibility="no"
          accessibilityElementsHidden
        />
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    // One line; under large system text the sentence wraps instead of pushing the ✕ off screen.
    link: {
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      columnGap: 8,
      minHeight: touchTarget,
      paddingHorizontal: 12,
      borderRadius: radius.button,
    },
    text: { flexShrink: 1, fontSize: 15, color: colors.muted },
    action: { fontSize: 15, fontWeight: '600', color: colors.primary },
    hide: {
      width: touchTarget,
      height: touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.button,
    },
    pressed: { backgroundColor: colors.surface },
  });
