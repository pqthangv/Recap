import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { listDecks } from '@/db/decks';
import { importCards, type ImportTarget } from '@/db/import';
import { useLive } from '@/db/live';
import { DeckTarget } from '@/features/import/DeckTarget';
import { targetIsValid, useFinishImport } from '@/features/import/shared';
import type { GeneratedCard } from '@/lib/ai';
import {
  cardsToSave,
  setAllSelected,
  suggestDeckName,
  toReviewItems,
  type AiSource,
  type ReviewItem,
} from '@/lib/aiReview';
import { plural } from '@/lib/format';
import { colors, radius, touchTarget } from '@/lib/theme';

import { useAiDraft } from './api';

/** Check, edit and choose the AI's cards. Nothing is saved until "Save". */
export default function ReviewCardsScreen() {
  const router = useRouter();
  const { cards, source } = useAiDraft();
  if (!cards || cards.length === 0) {
    return (
      <View style={styles.content}>
        <Text style={styles.help}>No cards to review.</Text>
        <Button label="Back" onPress={() => router.back()} />
      </View>
    );
  }
  return <Review cards={cards} source={source} />;
}

function Review({ cards, source }: { cards: GeneratedCard[]; source: AiSource }) {
  const decks = useLive(listDecks, ['decks']);
  const finish = useFinishImport();
  const suggested = suggestDeckName(source);
  const [items, setItems] = useState<ReviewItem[]>(() => toReviewItems(cards));
  const [target, setTarget] = useState<ImportTarget>({ kind: 'new', name: suggested });
  const toSave = cardsToSave(items);
  const allSelected = items.every((i) => i.selected);
  const canSave = toSave.length > 0 && targetIsValid(target, decks);

  const change = (key: string, patch: Partial<ReviewItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key: string) => setItems((list) => list.filter((i) => i.key !== key));

  const save = () => {
    if (!canSave) return;
    const summary = importCards(toSave, target);
    useAiDraft.setState({ cards: null });
    finish(summary);
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>
            {toSave.length} of {plural(items.length, 'card')} selected
          </Text>
          <Button
            variant="text"
            label={allSelected ? 'Deselect all' : 'Select all'}
            onPress={() => setItems((list) => setAllSelected(list, !allSelected))}
          />
        </View>
        <Text style={styles.help}>Check each card. Edit anything that isn&apos;t quite right.</Text>

        {items.map((item, index) => (
          <View key={item.key} style={[styles.card, !item.selected && styles.cardOff]}>
            <View style={styles.cardTop}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.selected }}
                accessibilityLabel={`Keep card ${index + 1}`}
                onPress={() => change(item.key, { selected: !item.selected })}
                style={styles.checkHit}
              >
                <Checkbox checked={item.selected} />
                <Text style={styles.cardNumber}>Card {index + 1}</Text>
              </Pressable>
              <Button
                variant="text"
                label="Remove"
                accessibilityLabel={`Remove card ${index + 1}`}
                onPress={() => remove(item.key)}
              />
            </View>
            <TextInput
              value={item.front}
              onChangeText={(front) => change(item.key, { front })}
              accessibilityLabel={`Card ${index + 1} front`}
              multiline
              style={[styles.input, styles.front]}
            />
            <TextInput
              value={item.back}
              onChangeText={(back) => change(item.key, { back })}
              accessibilityLabel={`Card ${index + 1} back`}
              multiline
              style={styles.input}
            />
          </View>
        ))}

        <DeckTarget value={target} onChange={setTarget} decks={decks} suggestedName={suggested} />
        <Button
          size="lg"
          label={toSave.length > 0 ? `Save ${plural(toSave.length, 'card')}` : 'Save'}
          onPress={save}
          disabled={!canSave}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, flexShrink: 1 },
  help: { fontSize: 15, color: colors.muted },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 12,
    gap: 8,
  },
  cardOff: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  checkHit: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touchTarget },
  cardNumber: { fontSize: 15, color: colors.muted, fontWeight: '600' },
  input: {
    minHeight: touchTarget,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  front: { fontWeight: '600' },
});
