import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { countCards } from '@/db/cards';
import { createDeck, deleteDeck, getDeck, updateDeck } from '@/db/decks';
import { plural } from '@/lib/format';
import { colors, deckColors, radius, touchTarget } from '@/lib/theme';

/** New deck, or edit an existing one when opened with `?id=`. */
export default function DeckFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const [existing] = useState(() => (id ? getDeck(id) : undefined));
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState<string>(existing?.color ?? deckColors[0]);
  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    if (existing) {
      updateDeck(existing.id, { name, color });
      router.back();
    } else {
      const deck = createDeck({ name, color });
      router.replace({ pathname: '/deck/[id]', params: { id: deck.id } });
    }
  };

  const confirmDelete = () => {
    if (!existing) return;
    const n = countCards(existing.id);
    Alert.alert(
      'Delete this deck?',
      `"${existing.name}" and its ${plural(n, 'card')} will be deleted. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteDeck(existing.id);
            router.dismissTo('/');
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: existing ? 'Edit deck' : 'New deck' }} />
      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Biology"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Deck name"
        autoFocus={!existing}
        returnKeyType="done"
        onSubmitEditing={save}
        style={styles.input}
        maxLength={80}
      />

      <Text style={styles.label}>Color</Text>
      <View style={styles.colors} accessibilityRole="radiogroup">
        {deckColors.map((c, i) => (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityLabel={`Color ${i + 1}`}
            accessibilityState={{ checked: c === color }}
            onPress={() => setColor(c)}
            style={[styles.swatchHit, c === color && styles.swatchSelected]}
          >
            <View style={[styles.swatch, { backgroundColor: c }]} />
          </Pressable>
        ))}
      </View>

      <Button label="Save" onPress={save} disabled={!canSave} style={styles.save} />
      {existing ? <Button variant="danger" label="Delete deck" onPress={confirmDelete} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 8 },
  label: { fontSize: 15, fontWeight: '600', color: colors.muted, marginTop: 8 },
  input: {
    minHeight: touchTarget,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: 17,
    color: colors.text,
  },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  swatchHit: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: { borderColor: colors.text },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  save: { marginTop: 24 },
});
