import { useEffect } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SpeakerIcon } from '@/components/SpeakerIcon';
import { speak, stopSpeaking } from '@/features/speech/speech';
import { colors, radius, touchTarget } from '@/lib/theme';

type Props = {
  front: string;
  back: string;
  flipped: boolean;
  onFlip: () => void;
  /** Read the front aloud when the card appears and the back when it is flipped. */
  autoRead: boolean;
  /** Optional picture, shown on the side it belongs to (question pictures stay visible on the answer side). */
  imageUri?: string | null;
  imageSide?: 'front' | 'back' | null;
};

/** The card. Tap to turn it over. Mount it with a new `key` for each card so it starts face-down. */
export function FlipCard({ front, back, flipped, onFlip, autoRead, imageUri, imageSide }: Props) {
  const picture = (small = false) =>
    imageUri ? (
      <Image
        source={{ uri: imageUri }}
        style={[styles.picture, small && styles.pictureSmall]}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    ) : null;
  const onFront = imageSide !== 'back';
  const reduceMotion = useReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (!flipped) rotation.set(0);
    else rotation.set(reduceMotion ? 180 : withTiming(180, { duration: 320 }));
  }, [flipped, reduceMotion, rotation]);

  useEffect(() => {
    if (autoRead) speak(front);
  }, [autoRead, front]);
  useEffect(() => {
    if (autoRead && flipped) speak(back);
  }, [autoRead, flipped, back]);
  // Stop talking when this card goes away (next card, or leaving the study screen).
  useEffect(() => stopSpeaking, []);

  const frontStyle = useAnimatedStyle(() => ({
    opacity: rotation.get() < 90 ? 1 : 0,
    transform: [{ perspective: 1200 }, { rotateY: `${rotation.get()}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: rotation.get() < 90 ? 0 : 1,
    transform: [{ perspective: 1200 }, { rotateY: `${rotation.get() - 180}deg` }],
  }));

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onFlip}
        disabled={flipped}
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={flipped ? `${front}. Answer: ${back}` : front}
        accessibilityHint={flipped ? undefined : 'Double tap to show the answer'}
      >
        <Animated.View
          style={[styles.face, frontStyle]}
          pointerEvents={flipped ? 'none' : 'auto'}
          importantForAccessibility="no-hide-descendants"
        >
          <ScrollView contentContainerStyle={styles.faceContent}>
            {onFront ? picture() : null}
            <Text style={styles.frontText}>{front}</Text>
            <Text style={styles.tapHint}>Tap to show answer</Text>
          </ScrollView>
        </Animated.View>
        <Animated.View
          style={[styles.face, backStyle]}
          pointerEvents={flipped ? 'auto' : 'none'}
          importantForAccessibility="no-hide-descendants"
        >
          <ScrollView contentContainerStyle={styles.faceContent}>
            {onFront ? picture(true) : null}
            <Text style={styles.frontSmall}>{front}</Text>
            <View style={styles.divider} />
            <Text style={styles.backText}>{back}</Text>
            {onFront ? null : picture()}
          </ScrollView>
        </Animated.View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={flipped ? 'Read the answer aloud' : 'Read the question aloud'}
        onPress={() => speak(flipped ? back : front)}
        style={({ pressed }) => [styles.speaker, pressed && styles.speakerPressed]}
      >
        <SpeakerIcon size={26} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  picture: { width: '100%', height: 200, marginBottom: 16, borderRadius: radius.button },
  pictureSmall: { height: 120 },
  speaker: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerPressed: { opacity: 0.7 },
  face: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    backfaceVisibility: 'hidden',
    elevation: 2,
    shadowColor: colors.text,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  // Vertical padding keeps text clear of the speaker button.
  faceContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 68,
  },
  frontText: { fontSize: 26, lineHeight: 34, color: colors.text, textAlign: 'center' },
  tapHint: { marginTop: 24, fontSize: 14, color: colors.muted, textAlign: 'center' },
  frontSmall: { fontSize: 17, lineHeight: 24, color: colors.muted, textAlign: 'center' },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginVertical: 20,
    marginHorizontal: 24,
  },
  backText: { fontSize: 24, lineHeight: 32, color: colors.text, textAlign: 'center' },
});
