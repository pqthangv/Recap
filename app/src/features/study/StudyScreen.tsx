import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { listDecks } from '@/db/decks';
import { syncReminders } from '@/features/reminders/reminders';
import { decksInGroup } from '@/lib/deckGroups';
import { t, tn } from '@/lib/i18n';
import { colors } from '@/lib/theme';

import { FlipCard } from './FlipCard';
import { GradeButtons } from './GradeButtons';
import { useStudySession } from './useStudySession';

export default function StudyScreen() {
  const { deckId, group } = useLocalSearchParams<{ deckId?: string; group?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // A deck group is studied as the decks it has when the session starts.
  const [scope] = useState(() =>
    group ? decksInGroup(listDecks(), group).map((d) => d.id) : deckId,
  );
  const session = useStudySession(scope);
  const { card, previews } = session;
  const finished = card === null;

  // Studying can keep the streak, so re-plan the reminders when a session ends or is left (e.g.
  // tonight's "streak ends tonight" goes), not only when the app goes to the background.
  useEffect(() => {
    if (finished) void syncReminders();
  }, [finished]);
  useEffect(
    () => () => {
      void syncReminders();
    },
    [],
  );

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}>
      <Stack.Screen
        options={{
          title: card ? t('study.left', { n: session.remaining }) : t('screen.study'),
          headerRight: session.canUndo
            ? () => (
                <Button
                  variant="text"
                  label={t('common.undo')}
                  accessibilityLabel={t('study.undoA11y')}
                  onPress={session.undo}
                />
              )
            : undefined,
        }}
      />
      {card ? (
        <>
          <FlipCard
            key={session.turn}
            front={card.front}
            back={card.back}
            flipped={session.revealed}
            onFlip={session.flip}
            autoRead={session.readAloud}
            imageUri={card.image_uri}
            imageSide={card.image_side}
          />
          <View style={styles.actions}>
            {previews ? (
              <GradeButtons
                previews={previews}
                fourButtons={session.fourButtons}
                onGrade={session.answer}
              />
            ) : (
              <Button
                size="lg"
                variant="secondary"
                label={t('study.showAnswer')}
                onPress={session.flip}
              />
            )}
          </View>
        </>
      ) : (
        <View style={styles.done}>
          <Text accessibilityRole="header" style={styles.doneTitle}>
            {session.reviewed > 0
              ? t('study.niceWork', { cards: tn('count.card', session.reviewed) })
              : t('study.nothing')}
          </Text>
          <Text style={styles.doneText}>{t('study.seeYou')}</Text>
          <Button
            label={t('common.done')}
            onPress={() => router.back()}
            style={styles.doneButton}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 8 },
  actions: { paddingTop: 20 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  doneTitle: { fontSize: 26, fontWeight: '700', color: colors.text, textAlign: 'center' },
  doneText: { fontSize: 17, color: colors.muted },
  doneButton: { marginTop: 24, alignSelf: 'stretch' },
});
