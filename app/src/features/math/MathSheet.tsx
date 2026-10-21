// "+ Math" in the card editor: a sheet for writing one formula. A large preview shows it as it's
// typed; the buttons put in fractions, roots, powers, symbols and Greek letters with the cursor
// where the next thing goes, so nobody has to know LaTeX (people who do can just type it).
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { t } from '@/lib/i18n';
import {
  applyButton,
  BASICS,
  formulaProblem,
  SYMBOLS,
  type MathButton,
  type Selection,
} from '@/lib/math/templates';
import { type Colors, radius, touchTarget, useColors, useStyles } from '@/lib/theme';

import { drawMath, knowsCommand, useMathReady } from './load';
import { MathText } from './MathText';

type Props = {
  /** The formula being edited, or '' for a new one. */
  initial: string;
  onDone: (tex: string) => void;
  onCancel: () => void;
};

function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/** Shown while open; the editor mounts it for each formula, so it starts fresh. */
export function MathSheet({ initial, onDone, onCancel }: Props) {
  const styles = useStyles(makeStyles);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardShown();
  const [tex, setTex] = useState(initial);
  const [selection, setSelection] = useState<Selection>({
    start: initial.length,
    end: initial.length,
  });
  // Set after a button, so the cursor lands in the piece it put in; let go once it's there.
  const [cursor, setCursor] = useState<Selection>();
  const box = useRef<TextInput>(null);

  const ready = useMathReady();
  const formula = tex.trim();
  const drawn = ready && formula ? drawMath(formula, true) : null;
  const problem = drawn && 'error' in drawn ? formulaProblem(formula, knowsCommand) : null;

  const press = (button: MathButton) => {
    const edit = applyButton(tex, selection, button);
    setTex(edit.text);
    setSelection(edit.selection);
    setCursor(edit.selection);
    box.current?.focus();
  };

  const row = (buttons: readonly MathButton[]) => (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.keys}
    >
      {buttons.map((button) => (
        <Pressable
          key={button.label}
          accessibilityRole="button"
          accessibilityLabel={t(button.a11y)}
          onPress={() => press(button)}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
        >
          <Text style={styles.keyText}>{button.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <Pressable
          style={styles.backdrop}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View style={[styles.sheet, { paddingBottom: (keyboard ? 0 : insets.bottom) + 12 }]}>
          <View style={styles.header}>
            <Button variant="text" label={t('common.cancel')} onPress={onCancel} />
            <Text accessibilityRole="header" style={styles.title}>
              {t('math.sheetTitle')}
            </Text>
            <Button label={t('common.done')} onPress={() => onDone(formula)} />
          </View>

          <View style={styles.preview}>
            {formula ? (
              <MathText text={`$$${formula}$$`} style={styles.previewText} />
            ) : (
              <Text style={styles.previewEmpty}>{t('math.previewEmpty')}</Text>
            )}
          </View>
          {problem ? (
            <Text style={styles.problem} accessibilityLiveRegion="polite">
              {t(problem.key, { command: problem.command ?? '' })}
            </Text>
          ) : null}

          <TextInput
            ref={box}
            value={tex}
            onChangeText={(text) => {
              setTex(text);
              setCursor(undefined);
            }}
            selection={cursor}
            onSelectionChange={(e) => {
              const now = e.nativeEvent.selection;
              setSelection(now);
              if (cursor && now.start === cursor.start && now.end === cursor.end) {
                setCursor(undefined);
              }
            }}
            autoFocus
            autoCorrect={false}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            importantForAutofill="no"
            placeholder={t('math.placeholder')}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t('math.boxA11y')}
            returnKeyType="done"
            onSubmitEditing={() => onDone(formula)}
            style={styles.box}
          />
          {row(BASICS)}
          {row(SYMBOLS)}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    fill: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: colors.backdrop },
    sheet: {
      backgroundColor: colors.sheet,
      borderTopLeftRadius: radius.card,
      borderTopRightRadius: radius.card,
      paddingTop: 8,
      paddingHorizontal: 12,
      gap: 10,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 17, fontWeight: '700', color: colors.text },
    preview: {
      minHeight: 88,
      borderRadius: radius.button,
      borderWidth: 1,
      borderColor: colors.hairline,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
    },
    previewText: { fontSize: 24, color: colors.text, textAlign: 'center' },
    previewEmpty: { fontSize: 15, color: colors.muted, textAlign: 'center' },
    problem: { fontSize: 15, color: colors.danger, paddingHorizontal: 4 },
    box: {
      minHeight: touchTarget,
      borderRadius: radius.button,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      fontSize: 17,
      fontFamily: MONOSPACE,
      color: colors.text,
    },
    keys: { gap: 8, paddingVertical: 2 },
    key: {
      minWidth: touchTarget,
      minHeight: touchTarget,
      paddingHorizontal: 12,
      borderRadius: radius.button,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyPressed: { backgroundColor: colors.tint },
    keyText: { fontSize: 18, color: colors.text },
  });
