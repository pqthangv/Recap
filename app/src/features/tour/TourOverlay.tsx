// The tour on top of the real screens: everything blurred and dimmed except the button being
// explained, which stays sharp inside a ring, with a short card next to it (Next, Back, "2 of 6",
// Skip tour). A blur can't have a hole, so it's four strips around the button, and the dim on top
// is drawn with a rounded hole, so the strips' square corners don't show. Round buttons get the
// same rounded square: a round hole leaves the strips' corners showing as a square (Android's blur
// has a fine grain). On Android the blur reads the app through BlurTargetView (app/_layout.tsx);
// Android 11 and older only dim (their blur is slow). Touches behind the tour are blocked: its
// buttons move it on.
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { type RefObject, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  findNodeHandle,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Button } from '@/components/Button';
import { useScheme } from '@/lib/appearance';
import { t } from '@/lib/i18n';
import { type Colors, radius, useColors, useStyles } from '@/lib/theme';

import { measureTarget, type Rect } from './targets';
import {
  finishPart,
  nextStep,
  previousStep,
  skipTour,
  stopTour,
  useTourShowing,
  type Showing,
} from './tour';

/** Space around the sharp button, and between it and the card. */
const PAD = 8;
const GAP = 12;
/** The sharp part's corners. */
const CORNER = 16;
const CARD_MAX_WIDTH = 420;
const EDGE = 16;

type Size = { width: number; height: number };

export function TourOverlay({ blurTarget }: { blurTarget: RefObject<View | null> }) {
  const showing = useTourShowing();
  if (!showing || showing.paused) return null;
  return <TourStepView showing={showing} blurTarget={blurTarget} />;
}

function TourStepView({
  showing,
  blurTarget,
}: {
  showing: Showing;
  blurTarget: RefObject<View | null>;
}) {
  const styles = useStyles(makeStyles);
  const colors = useColors();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const rootRef = useRef<View>(null);
  const textRef = useRef<Text>(null);
  const [size, setSize] = useState<Size | null>(null);
  // The sharp button of the step it was measured for (kept until the next one is found, so the
  // blur doesn't flash between steps).
  const [found, setFound] = useState<{ id: string; rect: Rect } | null>(null);
  const { part, steps, index } = showing;
  const step = steps[index];
  const last = index === steps.length - 1;
  const hole = step.target ? (found?.rect ?? null) : null;
  const ready = step.target === null || found?.id === step.id;
  const corner = hole ? CORNER : 0;

  useEffect(() => {
    const target = step.target;
    if (!target || !size) return;
    let live = true;
    let tries = 0;
    const find = async () => {
      const [rect, origin] = await Promise.all([measureTarget(target), measureRoot(rootRef)]);
      if (!live) return;
      if (rect && origin) setFound({ id: step.id, rect: around(rect, origin, size) });
      // Not on screen yet (the screen is still opening): look again shortly; then give up.
      else if (tries++ < 20) setTimeout(find, 100);
      else stopTour(part);
    };
    void find();
    return () => {
      live = false;
    };
  }, [step, size, part]);

  // TalkBack and VoiceOver read the step as soon as it shows.
  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    const node = textRef.current ? findNodeHandle(textRef.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [ready, step]);

  // Android's back button: the tour's Back; on the first step it ends the tour, like Skip.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index === 0) skipTour();
      else previousStep();
      return true;
    });
    return () => sub.remove();
  }, [index]);

  const onNext = () => {
    if (last && part === 'home') {
      // The tour ends on Library: a ready-made deck is the quickest way to start.
      finishPart('home');
      router.push('/library');
    } else nextStep();
  };

  return (
    <View
      ref={rootRef}
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
      // Nothing behind the tour can be tapped.
      onStartShouldSetResponder={() => true}
      accessibilityViewIsModal
    >
      {size
        ? strips(size, hole).map((strip, i) => (
            <BlurView
              // Always four, so the blur isn't made again between steps.
              key={i}
              blurTarget={blurTarget}
              blurMethod="dimezisBlurViewSdk31Plus"
              // Light: the screen behind stays easy to make out (user, 2026-11-06: "less severe",
              // then 8; 2026-11-07: 2).
              intensity={2}
              tint={scheme}
              style={[styles.strip, strip]}
            />
          ))
        : null}
      {size ? (
        <Svg width="100%" height="100%" style={styles.dim}>
          <Path d={dimPath(size, hole, corner)} fill={colors.backdrop} fillRule="evenodd" />
        </Svg>
      ) : null}
      {hole ? (
        <View
          style={[
            styles.ring,
            {
              left: hole.x,
              top: hole.y,
              width: hole.width,
              height: hole.height,
              borderRadius: corner,
            },
          ]}
        />
      ) : null}
      {size && ready ? (
        <View
          style={[
            styles.cardFrame,
            { paddingTop: insets.top + EDGE, paddingBottom: insets.bottom + EDGE },
          ]}
        >
          <Animated.View
            key={step.id}
            entering={FadeIn.duration(160)}
            style={[styles.card, cardPlace(size, hole, insets)]}
          >
            <ScrollView contentContainerStyle={styles.cardContent} bounces={false}>
              {step.title ? (
                <Text accessibilityRole="header" style={styles.title}>
                  {t(step.title)}
                </Text>
              ) : null}
              <Text ref={textRef} style={styles.text}>
                {t(step.text)}
              </Text>
              <Text
                style={styles.count}
                accessibilityLabel={t('tour.countA11y', { n: index + 1, total: steps.length })}
              >
                {t('tour.count', { n: index + 1, total: steps.length })}
              </Text>
              <View style={styles.buttons}>
                <Button variant="text" label={t('tour.skip')} onPress={() => skipTour()} />
                <View style={styles.move}>
                  {index > 0 && !step.waits ? (
                    <Button variant="secondary" label={t('tour.back')} onPress={previousStep} />
                  ) : null}
                  <Button
                    label={t(
                      !last ? 'tour.next' : part === 'home' ? 'tour.openLibrary' : 'tour.done',
                    )}
                    onPress={onNext}
                  />
                </View>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

function measureRoot(ref: RefObject<View | null>): Promise<{ x: number; y: number } | null> {
  const node = ref.current;
  if (!node) return Promise.resolve(null);
  return new Promise((resolve) => node.measureInWindow((x, y) => resolve({ x, y })));
}

/** The button's place in the tour's own frame, with a little room around it. */
function around(rect: Rect, origin: { x: number; y: number }, size: Size): Rect {
  const x = Math.max(0, rect.x - origin.x - PAD);
  const y = Math.max(0, rect.y - origin.y - PAD);
  const right = Math.min(size.width, rect.x - origin.x + rect.width + PAD);
  const bottom = Math.min(size.height, rect.y - origin.y + rect.height + PAD);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/** Above, below, left and right of the hole (no hole: the first covers everything). */
function strips({ width, height }: Size, hole: Rect | null): ViewStyle[] {
  if (!hole) {
    const none = { left: 0, top: 0, width: 0, height: 0 };
    return [{ left: 0, top: 0, width, height }, none, none, none];
  }
  const below = hole.y + hole.height;
  const right = hole.x + hole.width;
  return [
    { left: 0, top: 0, width, height: hole.y },
    { left: 0, top: below, width, height: height - below },
    { left: 0, top: hole.y, width: hole.x, height: hole.height },
    { left: right, top: hole.y, width: width - right, height: hole.height },
  ];
}

/** The dim: the whole screen (a little past its edges, so no pixel is left when the width isn't
 *  a whole number of pixels), less a rounded rectangle around the sharp part (even-odd fill). */
function dimPath({ width, height }: Size, hole: Rect | null, corner: number): string {
  const screen = `M-2 -2H${width + 2}V${height + 2}H-2Z`;
  if (!hole) return screen;
  const { x, y, width: w, height: h } = hole;
  const r = Math.min(corner, w / 2, h / 2);
  return (
    `${screen}M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

/** Below the button when there's more room there, else above; in the middle without one (the
 *  frame centers it). */
function cardPlace(
  { width, height }: Size,
  hole: Rect | null,
  insets: { top: number; bottom: number },
): ViewStyle {
  const cardWidth = Math.min(CARD_MAX_WIDTH, width - 2 * EDGE);
  if (!hole) return { width: cardWidth, maxHeight: '100%' };
  const top = insets.top + EDGE;
  const bottom = height - insets.bottom - EDGE;
  const center = hole.x + hole.width / 2;
  const left = Math.min(Math.max(center - cardWidth / 2, EDGE), width - EDGE - cardWidth);
  const roomBelow = bottom - (hole.y + hole.height + GAP);
  const roomAbove = hole.y - GAP - top;
  const place = { position: 'absolute', width: cardWidth, left } as const;
  return roomBelow >= roomAbove
    ? { ...place, top: hole.y + hole.height + GAP, maxHeight: roomBelow }
    : { ...place, bottom: height - (hole.y - GAP), maxHeight: roomAbove };
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    strip: { position: 'absolute', overflow: 'hidden', pointerEvents: 'none' },
    dim: { ...StyleSheet.absoluteFill, pointerEvents: 'none' },
    // On the edge of the sharp part, as round as the dim's hole.
    ring: {
      position: 'absolute',
      borderWidth: 2,
      borderColor: colors.primary,
      pointerEvents: 'none',
    },
    // The whole screen: centers a card without a button; a card next to one is placed itself.
    cardFrame: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'box-none',
    },
    card: {
      backgroundColor: colors.sheet,
      borderRadius: radius.card,
      elevation: 6,
      shadowColor: colors.text,
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    cardContent: { padding: 20, gap: 8 },
    title: { fontSize: 20, fontWeight: '700', color: colors.text },
    text: { fontSize: 17, lineHeight: 24, color: colors.text },
    count: { fontSize: 14, color: colors.muted },
    buttons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 4,
    },
    move: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginLeft: 'auto' },
  });
