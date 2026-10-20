// "Preview" under a card side that has math (card editor, Review cards): the side as it will look
// on the card. Nothing shows for a side without math.
import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/lib/i18n';
import type { CardLanguage } from '@/lib/language';
import { hasMath } from '@/lib/math/parse';
import { type Colors, radius, useStyles } from '@/lib/theme';

import { MathText } from './MathText';

type Props = {
  text: string;
  language: CardLanguage | null;
  /** Tap a formula to change it (the card editor). */
  onPressFormula?: (index: number) => void;
};

export function MathPreview({ text, language, onPressFormula }: Props) {
  const styles = useStyles(makeStyles);
  if (!hasMath(text)) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.label}>{t('math.preview')}</Text>
      <MathText
        text={text}
        style={styles.text}
        language={language}
        onPressFormula={onPressFormula}
      />
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    box: {
      gap: 4,
      padding: 12,
      borderRadius: radius.button,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    label: { fontSize: 13, color: colors.muted },
    text: { fontSize: 20, lineHeight: 28, color: colors.text, textAlign: 'center' },
  });
