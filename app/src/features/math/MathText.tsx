// A card side with its formulas drawn: text with formulas in the line, and a formula alone on its
// line centered on its own (what counts as math: lib/math/parse.ts). A side without math is the
// same plain <Text> as before. TalkBack reads it as one piece, with the formulas in words.
import { Fragment, useState, type ReactElement } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { t } from '@/lib/i18n';
import { detectLanguage, type CardLanguage } from '@/lib/language';
import { hasMath, isMath, splitMath, type MathPart, type Part } from '@/lib/math/parse';
import { sideToText } from '@/lib/math/plainText';
import { speakMath, speakSide } from '@/lib/math/speak';

import { dpToSp, FontScaleProbe, scalesInlineViews, spToDp, useScaleCurve } from './fontScaling';
import { MathSvg } from './MathSvg';

type Props = {
  text: string;
  /** Needs a fontSize and color: formulas are drawn at that size, in that color. */
  style: StyleProp<TextStyle>;
  /** The side's language, for what TalkBack says (null: guessed from the text). */
  language?: CardLanguage | null;
  /** Makes each formula a button (the card editor's preview: tap one to edit it). */
  onPressFormula?: (index: number) => void;
};

type Block = { formula: MathPart } | { parts: Part[] };

/** Paragraphs of text and inline formulas, split by the formulas that stand on their own. */
function blocks(parts: Part[]): Block[] {
  const out: Block[] = [];
  let paragraph: Part[] = [];
  const close = () => {
    const kept = paragraph.filter((p) => isMath(p) || p.text.trim());
    if (kept.length) out.push({ parts: paragraph });
    paragraph = [];
  };
  parts.forEach((part, i) => {
    if (isMath(part) && part.display) {
      close();
      out.push({ formula: part });
      return;
    }
    if (isMath(part)) {
      paragraph.push(part);
      return;
    }
    // The line breaks around a formula on its own line are the block's edges, not text.
    let text = part.text;
    if (i > 0 && isMath(parts[i - 1]) && (parts[i - 1] as MathPart).display) {
      text = text.replace(/^[ \t]*\n/, '');
    }
    const next = parts[i + 1];
    if (next && isMath(next) && next.display) text = text.replace(/\n[ \t]*$/, '');
    paragraph.push({ text });
  });
  close();
  return out;
}

const ALIGN = { center: 'center', right: 'flex-end' } as const;

export function MathText({ text, style, language, onPressFormula }: Props) {
  const [width, setWidth] = useState<number>();
  const { fontScale } = useWindowDimensions();
  const curve = useScaleCurve(fontScale);
  // No formulas: plain text as before ("\$5", a dollar sign typed safely, shows as "$5").
  if (!hasMath(text)) return <Text style={style}>{sideToText(text)}</Text>;

  const flat = StyleSheet.flatten(style);
  const fontSize = flat.fontSize ?? 16;
  const color = typeof flat.color === 'string' ? flat.color : '#000';
  // The size the text is really drawn at; until the curve is measured (a moment, once), the
  // phone's own factor is close enough.
  const size = curve ? spToDp(curve, fontSize) : fontSize * fontScale;
  // Inline formulas on Android: React Native scales the space it keeps for them like text, so
  // they get a size that scales back to their real one (see fontScaling.tsx).
  const inlineLayout =
    scalesInlineViews && curve && fontScale !== 1 ? (dp: number) => dpToSp(curve, dp) : undefined;
  // A fixed line height would let a tall formula run into the next line; the line grows instead.
  const { lineHeight: _fixed, ...growing } = flat;
  const lang = language ?? detectLanguage(sideToText(text));
  const align = ALIGN[flat.textAlign as keyof typeof ALIGN] ?? 'stretch';

  // Formulas are numbered in order (as findFormulas lists them), for onPressFormula.
  let count = 0;
  const formula = (tex: string, picture: ReactElement, key: number) => {
    const index = count++;
    if (!onPressFormula) return <Fragment key={key}>{picture}</Fragment>;
    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityLabel={t('math.editA11y', { formula: speakMath(tex, lang) })}
        hitSlop={8}
        onPress={() => onPressFormula(index)}
      >
        {picture}
      </Pressable>
    );
  };

  return (
    <View
      // Read as one piece, unless its formulas can be tapped (then each is a button).
      accessible={!onPressFormula}
      accessibilityLabel={onPressFormula ? undefined : speakSide(text, lang)}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ alignSelf: 'stretch', alignItems: align }}
    >
      {curve ? null : <FontScaleProbe fontScale={fontScale} />}
      {blocks(splitMath(text)).map((block, i) =>
        'formula' in block ? (
          <View key={i} style={styles.display}>
            {formula(
              block.formula.tex,
              <MathSvg
                tex={block.formula.tex}
                display
                size={size}
                color={color}
                fallbackStyle={flat}
                maxWidth={width}
              />,
              0,
            )}
          </View>
        ) : (
          <Text key={i} style={block.parts.some(isMath) ? growing : flat}>
            {block.parts.map((part, j) =>
              isMath(part)
                ? formula(
                    part.tex,
                    <MathSvg
                      tex={part.tex}
                      display={false}
                      size={size}
                      color={color}
                      maxWidth={width}
                      layoutSize={inlineLayout}
                    />,
                    j,
                  )
                : part.text,
            )}
          </Text>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  display: { alignSelf: 'stretch', alignItems: 'center', marginVertical: 4 },
});
