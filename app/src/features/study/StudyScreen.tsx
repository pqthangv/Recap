import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { listDecks } from '@/db/decks';
import { decksInGroup } from '@/lib/deckGroups';
import { plural } from '@/lib/format';
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

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}>
      <Stack.Screen
        options={{
          title: card ? `${session.remaining} left` : 'Study',
          headerRight: session.canUndo
            ? () => (
                <Button
                  variant="text"
                  label="Undo"
                  accessibilityLabel="Undo last answer"
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
              <Button size="lg" variant="secondary" label="Show answer" onPress={session.flip} />
            )}
          </View>
        </>
      ) : (
        <View style={styles.done}>
          <Text accessibilityRole="header" style={styles.doneTitle}>
            {session.reviewed > 0
              ? `Nice work — ${plural(session.reviewed, 'card')}.`
              : 'Nothing to study right now.'}
          </Text>
          <Text style={styles.doneText}>See you tomorrow.</Text>
          <Button label="Done" onPress={() => router.back()} style={styles.doneButton} />
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
