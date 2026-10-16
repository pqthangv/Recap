import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { listDecks } from '@/db/decks';
import { ReminderOffer } from '@/features/reminders/ReminderOffer';
import { syncReminders } from '@/features/reminders/reminders';
import { decksInGroup } from '@/lib/deckGroups';
import { t, tn } from '@/lib/i18n';
import { type Colors, useStyles } from '@/lib/theme';

import { AnswerBox } from './AnswerBox';
import { FlipCard } from './FlipCard';
import { GradeButtons, highlightedGrade } from './GradeButtons';
import { useStudySession } from './useStudySession';

export default function StudyScreen() {
  const styles = useStyles(makeStyles);
  const { deckId, group } = useLocalSearchParams<{ deckId?: string; group?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // A deck group is studied as the decks it has when the session starts.
  const [scope] = useState(() =>
    group ? decksInGroup(listDecks(), group).map((d) => d.id) : deckId,
  );
  const session = useStudySession(scope);
  const { card, previews, suggested, fourButtons, answer, turn } = session;
  const finished = card === null;
  // The keyboard's position is measured from the top of the screen and this view's from below the
  // header, so the keyboard-avoiding view needs to know where it starts, or the keyboard covers
  // the answer box by about the header's height.
  const frame = useRef<View>(null);
  const [frameTop, setFrameTop] = useState(0);

  // Web: after checking a typed answer, Enter takes the suggested grade (type, Enter, Enter).
  useEffect(() => {
    if (Platform.OS !== 'web' || !previews || !suggested) return;
    const grade = highlightedGrade(suggested, fourButtons);
    const onKey = (event: KeyboardEvent) => {
      // Japanese/Chinese keyboards confirm a word with Enter.
      if (event.key !== 'Enter' || event.isComposing || event.repeat) return;
      event.preventDefault();
      answer(grade);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [previews, suggested, fourButtons, answer]);

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
    // The bottom padding is on the outer view: the keyboard-avoiding view sets its own (0 with no
    // keyboard). The extra 12 keeps the answer box a little above the keyboard.
    <View
      ref={frame}
      style={[styles.frame, { paddingBottom: insets.bottom + 16 }]}
      onLayout={() => frame.current?.measureInWindow((_x, y) => setFrameTop(y))}
    >
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={frameTop + 12}
        style={styles.screen}
      >
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
              key={turn}
              front={card.front}
              back={card.back}
              flipped={session.revealed}
              // Tapping a card that's for typing counts as "Show answer".
              onFlip={session.typing ? () => session.checkTyped('') : session.flip}
              autoRead={session.readAloud}
              onQuestionRead={() => session.questionRead(turn)}
              languages={session.languages}
              check={session.typedCheck}
              imageRef={card.image_uri}
              imageSide={card.image_side}
            />
            <View style={styles.actions}>
              {previews ? (
                <GradeButtons
                  previews={previews}
                  fourButtons={fourButtons}
                  suggested={suggested}
                  onGrade={answer}
                />
              ) : session.typing ? (
                <AnswerBox
                  key={turn}
                  onStartTyping={session.startTyping}
                  onCheck={session.checkTyped}
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
            {session.reviewed > 0 ? <ReminderOffer /> : null}
            <Button
              label={t('common.done')}
              onPress={() => router.back()}
              style={styles.doneButton}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    frame: { flex: 1, backgroundColor: colors.background },
    screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 8 },
    actions: { paddingTop: 20 },
    done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    doneTitle: { fontSize: 26, fontWeight: '700', color: colors.text, textAlign: 'center' },
    doneText: { fontSize: 17, color: colors.muted },
    doneButton: { marginTop: 24, alignSelf: 'stretch' },
  });
