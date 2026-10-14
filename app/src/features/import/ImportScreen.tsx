import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '@/lib/i18n';
import { colors, radius, touchTarget } from '@/lib/theme';
import { showAlert } from '@/lib/alert';
import { can } from '@/lib/platform';

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
      showAlert(
        t('import.openFailed'),
        e instanceof ImportFileError ? e.message : t('import.tryAnotherFile'),
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
        title={t('import.paste')}
        detail={t('import.pasteDetail')}
        onPress={() => router.push('/import/paste')}
        disabled={busy}
      />
      <Option title={t('import.csv')} detail={t('import.csvDetail')} onPress={csv} disabled={busy}>
        <ExampleTable />
      </Option>
      {can.apkgImport ? (
        <Option
          title={t('import.anki')}
          detail={t('import.ankiDetail')}
          onPress={anki}
          disabled={busy}
        />
      ) : null}
      {busy ? <ActivityIndicator color={colors.primary} style={styles.spinner} /> : null}
    </ScrollView>
  );
}

// What a spreadsheet for import looks like (tags are optional).
function exampleRows(): string[][] {
  const front = (n: number) => t('import.exampleFront', { n });
  const back = (n: number) => t('import.exampleBack', { n });
  const tag = (n: number) => t('import.exampleTag', { n });
  return [
    [front(1), back(1), `${tag(1)}, ${tag(2)}, ${tag(3)}`],
    [front(2), back(2), tag(1)],
    [front(3), back(3), tag(3)],
  ];
}

function ExampleTable() {
  return (
    <View style={styles.table} importantForAccessibility="no-hide-descendants">
      {exampleRows().map((row, r) => (
        <View key={r} style={[styles.tableRow, r > 0 && styles.tableRowLine]}>
          {row.map((cell, c) => (
            <Text
              key={c}
              style={[styles.cell, c > 0 && styles.cellLine, c === 2 && styles.tagsCell]}
            >
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Option(props: {
  title: string;
  detail: string;
  onPress: () => void;
  disabled: boolean;
  children?: ReactNode;
}) {
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
        {props.children}
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
  table: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 8,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  tableRow: { flexDirection: 'row' },
  tableRowLine: { borderTopWidth: 1, borderTopColor: colors.hairline },
  cell: { flex: 1, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: colors.text },
  cellLine: { borderLeftWidth: 1, borderLeftColor: colors.hairline },
  tagsCell: { flex: 1.8 },
  spinner: { marginTop: 12 },
});
