// A leaderboard rank on a coin, drawn with react-native-svg like the sign-in logos. The top three
// are gold, silver and bronze medals on a violet ribbon; the rest are outlined coins. Only
// decoration: each row says its rank to screen readers.
import { StyleSheet, Text, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { count } from '@/lib/i18n';
import { type Colors, useColors, useStyles } from '@/lib/theme';

const MEDALS = {
  1: { outline: 'rankGold', fill: 'rankGoldFill' },
  2: { outline: 'rankSilver', fill: 'rankSilverFill' },
  3: { outline: 'rankBronze', fill: 'rankBronzeFill' },
} as const;

/** Ranks from here on don't fit on the coin (your own row can be far down). */
const PLAIN_FROM = 100;
/** The badge grows with the phone's text size, up to this much. */
const MAX_SCALE = 1.5;
// The coin is in the middle of the drawing, so it's level with the name; the ribbon is above it.
const WIDTH = 40;
const HEIGHT = 46;
const MIDDLE = HEIGHT / 2;

/** `medal`: the rank shows as a gold, silver or bronze medal (rank 1–3 with a score above 0). */
export function RankBadge({
  rank,
  medal,
  size = 40,
}: {
  rank: number;
  medal: boolean;
  /** The width; the height is a little more. */
  size?: number;
}) {
  const colors = useColors();
  const styles = useStyles(makeStyles);
  const { fontScale } = useWindowDimensions();
  if (rank >= PLAIN_FROM) return <Text style={styles.plain}>{count(rank)}</Text>;
  const tier = medal && (rank === 1 || rank === 2 || rank === 3) ? MEDALS[rank] : null;
  const outline = tier ? colors[tier.outline] : colors.rankOutline;
  const fill = tier ? colors[tier.fill] : 'none';
  const width = size * Math.min(Math.max(fontScale, 1), MAX_SCALE);
  return (
    <Svg
      width={width}
      height={(width * HEIGHT) / WIDTH}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      accessible={false}
    >
      {tier ? (
        <>
          {/* The ribbon's two strips cross behind the coin. */}
          <Path fill={colors.ribbon} d="M10.5 1h6l5 11.8h-6z" />
          <Path fill={colors.ribbonShade} d="M29.5 1h-6l-5 11.8h6z" />
        </>
      ) : null}
      <Circle cx={20} cy={MIDDLE} r={11.2} fill={fill} stroke={outline} strokeWidth={1.6} />
      {tier ? (
        <Circle
          cx={20}
          cy={MIDDLE}
          r={8.2}
          fill="none"
          stroke={outline}
          strokeWidth={0.9}
          strokeOpacity={0.7}
        />
      ) : null}
      <SvgText
        x={20}
        y={MIDDLE + 4.7}
        fill={tier ? colors.onRank : colors.text}
        fontSize={13}
        fontWeight="bold"
        textAnchor="middle"
      >
        {rank}
      </SvgText>
    </Svg>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    plain: { fontSize: 15, fontWeight: '700', color: colors.muted },
  });
