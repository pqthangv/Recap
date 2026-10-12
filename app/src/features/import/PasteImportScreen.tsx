import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { Button } from '@/components/Button';
import { listDecks } from '@/db/decks';
import { importCards, type ImportTarget } from '@/db/import';
import { useLive } from '@/db/live';
import { plural } from '@/lib/format';
import { parsePaste, SEPARATOR_LABELS } from '@/lib/import/paste';
import { colors, radius } from '@/lib/theme';

import { DeckTarget } from './DeckTarget';
import { CardPreview, targetIsValid, useFinishImport } from './shared';

const EXAMPLE = 'chat - cat\nchien - dog\nxin chào - hello';

export default function PasteImportScreen() {
  const decks = useLive(listDecks, ['decks']);
  const finish = useFinishImport();
  const [text, setText] = useState('');
  const [target, setTarget] = useState<ImportTarget>({ kind: 'new', name: 'My list' });
  const parsed = parsePaste(text);
  const count = parsed.cards.length;
  const canImport = count > 0 && targetIsValid(target, decks);

  const save = () => {
    if (!canImport) return;
    finish(
      importCards(
        parsed.cards.map((c) => ({ ...c, tags: [] })),
        target,
      ),
    );
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.help}>
          One card per line. Put a dash, a tab or a semicolon between the front and the back.
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={EXAMPLE}
          placeholderTextColor={colors.muted}
          accessibilityLabel="Your list, one card per line"
          multiline
          autoFocus
          autoCapitalize="none"
          style={styles.input}
        />
        {text.trim() ? (
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {count > 0
              ? `${plural(count, 'card')} found` +
                (parsed.separator ? ` · split by ${SEPARATOR_LABELS[parsed.separator]}` : '')
              : 'No cards yet — add a dash between the front and the back.'}
            {parsed.skipped.length > 0
              ? `\n${plural(parsed.skipped.length, 'line')} without a separator will be skipped.`
              : ''}
          </Text>
        ) : null}
        <CardPreview cards={parsed.cards.slice(0, 5)} total={count} />
        <DeckTarget value={target} onChange={setTarget} decks={decks} suggestedName="My list" />
        <Button
          size="lg"
          label={count > 0 ? `Import ${plural(count, 'card')}` : 'Import'}
          onPress={save}
          disabled={!canImport}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  help: { fontSize: 15, color: colors.muted },
  input: {
    minHeight: 160,
    maxHeight: 320,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    padding: 16,
    fontSize: 17,
    color: colors.text,
    textAlignVertical: 'top',
  },
  status: { fontSize: 15, color: colors.text },
});
