import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { listDecks } from '@/db/decks';
import { importCards, type ImportTarget } from '@/db/import';
import { useLive } from '@/db/live';
import { t, tn } from '@/lib/i18n';
import { guessColumns, tableToCards, type ColumnChoice } from '@/lib/import/csv';
import { type Colors, useStyles } from '@/lib/theme';

import { Chip, DeckTarget } from './DeckTarget';
import { baseName, useImportDraft, type TableDraft } from './files';
import { CardPreview, defaultTarget, targetIsValid, useFinishImport } from './shared';

export default function CsvImportScreen() {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const draft = useImportDraft((s) => s.table);
  if (!draft) {
    return (
      <View style={styles.content}>
        <Text style={styles.help}>{t('import.chooseFileFirst')}</Text>
        <Button label={t('common.back')} onPress={() => router.back()} />
      </View>
    );
  }
  return <CsvImport fileName={draft.fileName} table={draft.table} />;
}

function CsvImport({ fileName, table }: TableDraft) {
  const styles = useStyles(makeStyles);
  const decks = useLive(listDecks, ['decks']);
  const finish = useFinishImport();
  const name = baseName(fileName);
  const [choice, setChoice] = useState<ColumnChoice>(() => guessColumns(table));
  const [target, setTarget] = useState<ImportTarget>(() =>
    defaultTarget(name, guessColumns(table).deck >= 0 ? name : undefined),
  );
  const cards = tableToCards(table, choice);
  const canImport = cards.length > 0 && targetIsValid(target, decks);
  const set = (key: keyof ColumnChoice, value: number) =>
    setChoice((c) => ({ ...c, [key]: value }));

  const save = () => {
    if (canImport) finish(importCards(cards, target));
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets // iOS: keep the new deck name above the keyboard
    >
      <Text style={styles.help}>
        {fileName} · {tn('count.row', table.rows.length)}
      </Text>
      <ColumnPicker
        label={t('card.front')}
        columns={table.columns}
        value={choice.front}
        onChange={(v) => set('front', v)}
      />
      <ColumnPicker
        label={t('card.back')}
        columns={table.columns}
        value={choice.back}
        onChange={(v) => set('back', v)}
      />
      {table.columns.length > 2 ? (
        <ColumnPicker
          label={t('card.tags')}
          columns={table.columns}
          value={choice.tags}
          onChange={(v) => set('tags', v)}
          allowNone
        />
      ) : null}
      {choice.front === choice.back ? (
        <Text style={styles.warning}>{t('csv.sameColumn')}</Text>
      ) : null}
      <CardPreview cards={cards.slice(0, 10)} total={cards.length} />
      <DeckTarget
        value={target}
        onChange={setTarget}
        decks={decks}
        suggestedName={name}
        fromFile={
          choice.deck >= 0
            ? {
                label: t('csv.fromColumn', { column: table.columns[choice.deck] }),
                fallbackName: name,
              }
            : undefined
        }
      />
      <Button
        size="lg"
        label={
          cards.length > 0
            ? t('import.importN', { cards: tn('count.card', cards.length) })
            : t('import.import')
        }
        onPress={save}
        disabled={!canImport}
      />
    </ScrollView>
  );
}

function ColumnPicker(props: {
  label: string;
  columns: string[];
  value: number;
  onChange: (index: number) => void;
  allowNone?: boolean;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.picker}>
      <Text style={styles.label}>{props.label}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={props.label}>
        {props.allowNone ? (
          <Chip
            label={t('csv.none')}
            selected={props.value === -1}
            onPress={() => props.onChange(-1)}
          />
        ) : null}
        {props.columns.map((col, i) => (
          <Chip
            key={i}
            label={col}
            selected={props.value === i}
            onPress={() => props.onChange(i)}
          />
        ))}
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    content: { padding: 20, gap: 16, paddingBottom: 48 },
    help: { fontSize: 15, color: colors.muted },
    picker: { gap: 8 },
    label: { fontSize: 15, fontWeight: '600', color: colors.muted },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    warning: { fontSize: 15, color: colors.danger },
  });
