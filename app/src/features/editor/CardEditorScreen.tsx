import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/Button';
import { showSnackbar } from '@/components/Snackbar';
import { SwitchRow } from '@/components/SwitchRow';
import {
  cardPicture,
  createCard,
  deleteCards,
  getCardForEdit,
  restoreCards,
  updateCard,
  type CardInput,
  type CardPicture,
  type PictureSide,
} from '@/db/cards';
import { listDecks } from '@/db/decks';
import { Chip } from '@/features/import/DeckTarget';
import { PictureError, pictureUri } from '@/features/pictures/files';
import { pickPicture } from '@/features/pictures/pick';
import { formatTags, parseTags } from '@/lib/format';
import { can } from '@/lib/platform';
import { t } from '@/lib/i18n';
import { colors, radius, touchTarget } from '@/lib/theme';
import { showAlert } from '@/lib/alert';

/** Add a card (optionally into `?deckId=`), or edit one with `?id=`. */
export default function CardEditorScreen() {
  const params = useLocalSearchParams<{ id?: string; deckId?: string }>();
  const router = useRouter();
  const [editing] = useState(() => (params.id ? getCardForEdit(params.id) : undefined));
  // The card's deck comes first, so it's visible in the scrolling row (tap another to move it).
  const [decks] = useState(() => {
    const all = listDecks();
    const current = editing?.card.deck_id ?? params.deckId;
    return [...all.filter((d) => d.id === current), ...all.filter((d) => d.id !== current)];
  });
  const [deckId, setDeckId] = useState(
    editing?.card.deck_id ?? params.deckId ?? decks[0]?.id ?? '',
  );
  const [front, setFront] = useState(editing?.card.front ?? '');
  const [back, setBack] = useState(editing?.card.back ?? '');
  const [reverse, setReverse] = useState(editing?.hasReverse ?? false);
  const [tags, setTags] = useState(formatTags(editing?.card.tags ?? []));
  const [picture, setPicture] = useState<CardPicture | null>(() =>
    editing ? cardPicture(editing.card) : null,
  );
  const [addingPicture, setAddingPicture] = useState(false);
  const frontInput = useRef<TextInput>(null);
  const backInput = useRef<TextInput>(null);

  const canSave = front.trim() !== '' && back.trim() !== '' && deckId !== '' && !addingPicture;
  const input = (): CardInput => ({
    deckId,
    front,
    back,
    tags: parseTags(tags),
    reverse,
    picture,
  });

  // A replaced or removed picture isn't deleted here: the start-up clean-up removes pictures no
  // card uses (see sweepPictures), so leaving without saving loses nothing.
  const addPicture = async (from: 'camera' | 'library') => {
    setAddingPicture(true);
    try {
      const ref = await pickPicture(from);
      if (ref) setPicture((p) => ({ ref, side: p?.side ?? 'front' }));
    } catch (e) {
      console.warn(e);
      showAlert(
        t('card.pictureFailed'),
        e instanceof PictureError && e.kind === 'tooBig'
          ? t('card.pictureTooBig')
          : t('card.pictureUnreadable'),
      );
    } finally {
      setAddingPicture(false);
    }
  };

  const save = () => {
    if (!canSave) return;
    if (editing) updateCard(editing.card.id, input());
    else createCard(input());
    router.back();
  };

  const saveAndAddAnother = () => {
    if (!canSave) return;
    createCard(input());
    setFront('');
    setBack('');
    setPicture(null);
    frontInput.current?.focus();
    showSnackbar(t('card.added'));
  };

  const remove = () => {
    if (!editing) return;
    const ids = deleteCards([editing.card.id]);
    router.back();
    showSnackbar(t(ids.length > 1 ? 'card.deletedWithReverse' : 'card.deleted'), {
      label: t('common.undo'),
      onPress: () => restoreCards(ids),
    });
  };

  if (decks.length === 0) {
    return (
      <View style={styles.content}>
        <Text style={styles.label}>{t('card.needDeck')}</Text>
        <Button label={t('screen.newDeck')} onPress={() => router.replace('/deck/edit')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <Stack.Screen options={{ title: t(editing ? 'screen.editCard' : 'screen.addCard') }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t('card.deck')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {decks.map((d) => (
            <Pressable
              key={d.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: d.id === deckId }}
              onPress={() => setDeckId(d.id)}
              style={[styles.chip, d.id === deckId && styles.chipSelected]}
            >
              <View style={[styles.dot, { backgroundColor: d.color }]} />
              <Text style={[styles.chipText, d.id === deckId && styles.chipTextSelected]}>
                {d.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>{t('card.front')}</Text>
        <TextInput
          ref={frontInput}
          value={front}
          onChangeText={setFront}
          placeholder={t('card.frontPlaceholder')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('card.front')}
          multiline
          autoFocus={!editing}
          style={[styles.input, styles.multiline]}
          submitBehavior="submit"
          onSubmitEditing={() => backInput.current?.focus()}
          returnKeyType="next"
        />

        <Text style={styles.label}>{t('card.back')}</Text>
        <TextInput
          ref={backInput}
          value={back}
          onChangeText={setBack}
          placeholder={t('card.backPlaceholder')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('card.back')}
          multiline
          style={[styles.input, styles.multiline]}
        />

        {can.pictures ? <Text style={styles.label}>{t('card.picture')}</Text> : null}
        {!can.pictures ? null : picture ? (
          <PictureField
            picture={picture}
            onSide={(side) => setPicture({ ...picture, side })}
            onRemove={() => setPicture(null)}
          />
        ) : addingPicture ? (
          <View style={styles.adding} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.addingText}>{t('card.addingPicture')}</Text>
          </View>
        ) : (
          <View style={styles.row}>
            <Button
              variant="secondary"
              label={t('card.takePhoto')}
              onPress={() => addPicture('camera')}
              style={styles.flex}
            />
            <Button
              variant="secondary"
              label={t('card.choosePhoto')}
              onPress={() => addPicture('library')}
              style={styles.flex}
            />
          </View>
        )}

        <SwitchRow label={t('card.reverse')} value={reverse} onChange={setReverse} />

        <Text style={styles.label}>{t('card.tags')}</Text>
        <TextInput
          value={tags}
          onChangeText={setTags}
          placeholder={t('card.tagsPlaceholder')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('card.tagsA11y')}
          autoCapitalize="none"
          style={styles.input}
        />

        <View style={styles.actions}>
          {editing ? null : (
            <Button
              variant="secondary"
              label={t('card.saveAndAdd')}
              onPress={saveAndAddAnother}
              disabled={!canSave}
              style={styles.flex}
            />
          )}
          <Button label={t('common.save')} onPress={save} disabled={!canSave} style={styles.flex} />
        </View>
        {editing ? <Button variant="danger" label={t('card.delete')} onPress={remove} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const SIDES: readonly PictureSide[] = ['front', 'back'];

/** The card's picture: which side it shows on, and a way to remove it. */
function PictureField({
  picture,
  onSide,
  onRemove,
}: {
  picture: CardPicture;
  onSide: (side: PictureSide) => void;
  onRemove: () => void;
}) {
  const uri = pictureUri(picture.ref);
  return (
    <View style={styles.pictureField}>
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.picture}
          resizeMode="contain"
          accessible
          accessibilityLabel={t(
            picture.side === 'back' ? 'card.pictureOnBackA11y' : 'card.pictureOnFrontA11y',
          )}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View
        style={styles.row}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('card.pictureShowOn')}
      >
        <Text style={styles.showOn}>{t('card.pictureShowOn')}</Text>
        {SIDES.map((side) => (
          <Chip
            key={side}
            label={t(side === 'front' ? 'card.front' : 'card.back')}
            selected={picture.side === side}
            onPress={() => onSide(side)}
          />
        ))}
      </View>
      <Button variant="text" label={t('card.removePicture')} onPress={onRemove} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 8, paddingBottom: 40 },
  label: { fontSize: 15, fontWeight: '600', color: colors.muted, marginTop: 8 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: touchTarget,
    paddingHorizontal: 16,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipSelected: { backgroundColor: colors.tint, borderColor: colors.primary },
  chipText: { fontSize: 15, color: colors.text },
  chipTextSelected: { color: colors.primary, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  input: {
    minHeight: touchTarget,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 17,
    color: colors.text,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  adding: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touchTarget },
  addingText: { fontSize: 15, color: colors.muted },
  pictureField: { gap: 8 },
  picture: {
    width: '100%',
    height: 180,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
  },
  showOn: { fontSize: 15, color: colors.text },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  flex: { flex: 1 },
});
