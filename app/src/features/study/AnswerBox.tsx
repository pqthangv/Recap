import { type Ref, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { tourActiveNow, useTourActive } from '@/features/tour/tour';
import { t } from '@/lib/i18n';
import { type Colors, radius, touchTarget, useColors, useStyles } from '@/lib/theme';

type Props = {
  /** The first letter was typed (times "right and quick" for Easy). */
  onStartTyping: () => void;
  /** Check what was typed; empty means "Show answer". */
  onCheck: (typed: string) => void;
  /** The tour may cover the screen (features/tour): the keyboard opens once no step shows. */
  waitForTour?: boolean;
  ref?: Ref<View>;
};

/**
 * "Type the answer" under a card with a short answer. Mount it with a new `key` for each card so
 * it starts empty. Enter checks; the button says "Show answer" until something is typed.
 */
export function AnswerBox({ onStartTyping, onCheck, waitForTour = false, ref }: Props) {
  const styles = useStyles(makeStyles);
  const colors = useColors();
  const [typed, setTyped] = useState('');
  const input = useRef<TextInput>(null);
  const hasText = typed.trim().length > 0;
  const touring = useTourActive();

  // The study screen starts the tour before this runs, so the store is read here directly: this
  // render's `touring` is from before it started.
  useEffect(() => {
    if (waitForTour && !touring && !tourActiveNow()) input.current?.focus();
  }, [waitForTour, touring]);

  const submit = () => {
    // Closes the phone keyboard so the grade buttons are visible (and on the web, a second Enter
    // can't check again).
    input.current?.blur();
    onCheck(typed);
  };

  return (
    <View ref={ref} style={styles.box}>
      <TextInput
        ref={input}
        value={typed}
        onChangeText={(text) => {
          if (text.trim()) onStartTyping();
          setTyped(text);
        }}
        onSubmitEditing={submit}
        placeholder={t('study.typePlaceholder')}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t('study.typeA11y')}
        autoFocus={!waitForTour}
        // Foreign words and names: no autocorrect, no capital letters added.
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        style={styles.input}
      />
      <Button
        size="lg"
        variant={hasText ? 'primary' : 'secondary'}
        label={t(hasText ? 'study.check' : 'study.showAnswer')}
        onPress={submit}
      />
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    box: { gap: 12 },
    input: {
      minHeight: touchTarget + 8,
      borderRadius: radius.button,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      fontSize: 20,
      color: colors.text,
    },
  });
