import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { Button } from '@/components/Button';
import { listDecks } from '@/db/decks';
import { importCards, type ImportTarget } from '@/db/import';
import { useLive } from '@/db/live';
import { t, tn } from '@/lib/i18n';
import { parsePaste, separatorLabel } from '@/lib/import/paste';
import { colors, radius } from '@/lib/theme';

import { DeckTarget } from './DeckTarget';
import { CardPreview, targetIsValid, useFinishImport } from './shared';

export default function PasteImportScreen() {
  const decks = useLive(listDecks, ['decks']);
  const finish = useFinishImport();
  const [text, setText] = useState('');
  const [target, setTarget] = useState<ImportTarget>({
    kind: 'new',
    name: t('paste.defaultDeck'),
  });
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
        <Text style={styles.help}>{t('paste.help')}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('paste.example')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('paste.inputA11y')}
          multiline
          autoFocus
          autoCapitalize="none"
          style={styles.input}
        />
        {text.trim() ? (
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {count > 0
              ? parsed.separator
                ? t('paste.foundSplit', {
                    cards: tn('count.card', count),
                    separator: separatorLabel(parsed.separator),
                  })
                : t('paste.found', { cards: tn('count.card', count) })
              : t('paste.none')}
            {parsed.skipped.length > 0
              ? `\n${t('paste.skipped', { lines: tn('count.line', parsed.skipped.length) })}`
              : ''}
          </Text>
        ) : null}
        <CardPreview cards={parsed.cards.slice(0, 5)} total={count} />
        <DeckTarget
          value={target}
          onChange={setTarget}
          decks={decks}
          suggestedName={t('paste.defaultDeck')}
        />
        <Button
          size="lg"
          label={
            count > 0 ? t('import.importN', { cards: tn('count.card', count) }) : t('import.import')
          }
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
