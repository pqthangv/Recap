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

import { ActionSheet } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { showSnackbar } from '@/components/Snackbar';
import { adoptDeckLanguages, listDecks } from '@/db/decks';
import { importCards, type ImportTarget } from '@/db/import';
import { transaction } from '@/db/transaction';
import { useLive } from '@/db/live';
import { DeckTarget } from '@/features/import/DeckTarget';
import { targetIsValid, useFinishImport } from '@/features/import/shared';
import { AiError, type GeneratedCard, type ReportReason } from '@/lib/ai';
import {
  cardsToSave,
  fewerCardsNote,
  REPORT_REASONS,
  setAllSelected,
  suggestDeckName,
  toReviewItems,
  type AiSource,
  type ReviewItem,
} from '@/lib/aiReview';
import { t, tn } from '@/lib/i18n';
import { colors, radius, touchTarget } from '@/lib/theme';

import { ai, useAiDraft } from './api';

/** Check, edit and choose the AI's cards. Nothing is saved until "Save". */
export default function ReviewCardsScreen() {
  const router = useRouter();
  const { cards, source, asked, left } = useAiDraft();
  if (!cards || cards.length === 0) {
    return (
      <View style={styles.content}>
        <Text style={styles.help}>{t('review.none')}</Text>
        <Button label={t('common.back')} onPress={() => router.back()} />
      </View>
    );
  }
  return <Review cards={cards} source={source} fewer={fewerCardsNote(cards.length, asked, left)} />;
}

function Review({
  cards,
  source,
  fewer,
}: {
  cards: GeneratedCard[];
  source: AiSource;
  fewer: string | null;
}) {
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

  // Reporting: the reasons sheet is open for `reporting`; `sending` holds cards on their way.
  const [reporting, setReporting] = useState<ReviewItem | null>(null);
  const [sending, setSending] = useState<ReadonlySet<string>>(() => new Set());
  const report = async (item: ReviewItem, reason: ReportReason) => {
    setSending((keys) => new Set(keys).add(item.key));
    try {
      await ai.report(item, reason);
      remove(item.key);
      showSnackbar(t('review.reported'));
    } catch (e) {
      showSnackbar(e instanceof AiError ? e.message : t('review.reportFailed'));
    } finally {
      setSending((keys) => {
        const next = new Set(keys);
        next.delete(item.key);
        return next;
      });
    }
  };

  const save = () => {
    if (!canSave) return;
    const summary = transaction(() => {
      const result = importCards(toSave, target);
      // Read the deck aloud in the languages the cards were written in, unless it has its own.
      const { languages } = useAiDraft.getState();
      for (const deck of result.decks) adoptDeckLanguages(deck.id, languages);
      return result;
    });
    useAiDraft.setState({ cards: null });
    finish(summary);
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>
            {t('review.selected', {
              selected: toSave.length,
              cards: tn('count.card', items.length),
            })}
          </Text>
          <Button
            variant="text"
            label={t(allSelected ? 'common.deselectAll' : 'common.selectAll')}
            onPress={() => setItems((list) => setAllSelected(list, !allSelected))}
          />
        </View>
        {fewer ? <Text style={styles.fewer}>{fewer}</Text> : null}

        {items.map((item, index) => (
          <View key={item.key} style={[styles.card, !item.selected && styles.cardOff]}>
            <View style={styles.cardTop}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.selected }}
                accessibilityLabel={t('review.keepA11y', { n: index + 1 })}
                onPress={() => change(item.key, { selected: !item.selected })}
                style={styles.checkHit}
              >
                <Checkbox checked={item.selected} />
                <Text style={styles.cardNumber}>{t('review.cardN', { n: index + 1 })}</Text>
              </Pressable>
              <View style={styles.cardActions}>
                <Button
                  variant="text"
                  label={t(sending.has(item.key) ? 'review.reporting' : 'review.report')}
                  accessibilityLabel={t('review.reportA11y', { n: index + 1 })}
                  onPress={() => setReporting(item)}
                  disabled={sending.has(item.key)}
                />
                <Button
                  variant="text"
                  label={t('review.remove')}
                  accessibilityLabel={t('review.removeA11y', { n: index + 1 })}
                  onPress={() => remove(item.key)}
                />
              </View>
            </View>
            <TextInput
              value={item.front}
              onChangeText={(front) => change(item.key, { front })}
              accessibilityLabel={t('review.frontA11y', { n: index + 1 })}
              multiline
              style={[styles.input, styles.front]}
            />
            <TextInput
              value={item.back}
              onChangeText={(back) => change(item.key, { back })}
              accessibilityLabel={t('review.backA11y', { n: index + 1 })}
              multiline
              style={styles.input}
            />
          </View>
        ))}

        <DeckTarget value={target} onChange={setTarget} decks={decks} suggestedName={suggested} />
        <Button
          size="lg"
          label={
            toSave.length > 0
              ? t('review.saveN', { cards: tn('count.card', toSave.length) })
              : t('common.save')
          }
          onPress={save}
          disabled={!canSave}
        />
      </ScrollView>
      <ActionSheet
        visible={reporting !== null}
        title={t('review.reportTitle')}
        options={REPORT_REASONS.map(({ reason, label }) => ({
          label: t(label),
          onPress: () => reporting && report(reporting, reason),
        }))}
        onClose={() => setReporting(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, flexShrink: 1 },
  help: { fontSize: 15, color: colors.muted },
  fewer: {
    fontSize: 15,
    color: colors.primary,
    backgroundColor: colors.tint,
    borderRadius: radius.button,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 12,
    gap: 8,
  },
  cardOff: { opacity: 0.55 },
  cardTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardActions: { flexDirection: 'row', marginLeft: 'auto' },
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
