import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radius, touchTarget } from '@/lib/theme';

import { ImportFileError, pickAnkiFile, pickTableFile, useImportDraft } from './files';

/** "Import cards": paste a list, a CSV file, or an Anki deck. */
export default function ImportScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (e) {
      console.warn(e);
      Alert.alert(
        "Couldn't open that file",
        e instanceof ImportFileError ? e.message : 'Please try another file.',
      );
    } finally {
      setBusy(false);
    }
  };

  const csv = () =>
    run(async () => {
      const table = await pickTableFile();
      if (!table) return;
      useImportDraft.setState({ table });
      router.push('/import/csv');
    });

  const anki = () =>
    run(async () => {
      const deck = await pickAnkiFile();
      if (!deck) return;
      useImportDraft.setState({ anki: deck });
      router.push('/import/anki');
    });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Option
        title="Paste a list"
        detail="One card per line, like “chat - cat”."
        onPress={() => router.push('/import/paste')}
        disabled={busy}
      />
      <Option
        title="CSV or spreadsheet file"
        detail="A .csv or .tsv file from Excel, Google Sheets or a Recap export."
        onPress={csv}
        disabled={busy}
      />
      <Option
        title="Anki deck (.apkg)"
        detail="Shared decks or your own. Cards start fresh as new cards."
        onPress={anki}
        disabled={busy}
      />
      {busy ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
    </ScrollView>
  );
}

function Option(props: { title: string; detail: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.title}. ${props.detail}`}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <View style={styles.optionText}>
        <Text style={styles.title}>{props.title}</Text>
        <Text style={styles.detail}>{props.detail}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: touchTarget + 24,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  pressed: { backgroundColor: colors.surface },
  optionText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  detail: { fontSize: 14, color: colors.muted, marginTop: 4 },
  chevron: { fontSize: 26, color: colors.muted },
  spinner: { marginTop: 12 },
});
