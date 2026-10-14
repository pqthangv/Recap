import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FlameIcon } from '@/components/FlameIcon';
import { useLive } from '@/db/live';
import { getStats } from '@/db/stats';
import { count, formatStudyTime, formatStudyTimeLong, weekdayShort } from '@/lib/format';
import { t, tn } from '@/lib/i18n';
import { colors, radius } from '@/lib/theme';

const BAR_MAX_HEIGHT = 140;

/** Under each bar: "Mon", …, "Today" (`short` for the narrow label, else for screen readers). */
function dayLabel(offset: number, day: number, short = false): string {
  if (offset === 0) return t(short ? 'stats.todayShort' : 'stats.today');
  return weekdayShort(day);
}

export default function StatsScreen() {
  // Cards, decks and settings change today's new-card goal.
  const stats = useLive(() => getStats(), ['review_logs', 'cards', 'decks', 'settings']);
  const { done, goal } = stats.goal;
  const last = stats.lastWeek.length - 1;
  const max = Math.max(1, ...stats.lastWeek.map((d) => d.cards));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.tiles}>
        <Tile
          label={t('stats.newToday')}
          value={`${count(done)} / ${count(goal)}`}
          spoken={t('stats.ofGoal', { done, goal })}
          detail={t(
            stats.goalMetToday
              ? 'stats.streakKept'
              : goal > 0
                ? 'stats.finishForStreak'
                : 'stats.anyForStreak',
          )}
        />
        <Tile
          label={t('stats.streak')}
          value={tn('count.day', stats.streak)}
          icon={<FlameIcon size={30} lit={stats.streak > 0} />}
        />
      </View>
      <View style={styles.tiles}>
        <Tile
          label={t('stats.studiedToday')}
          value={formatStudyTime(stats.timeToday)}
          spoken={formatStudyTimeLong(stats.timeToday)}
        />
        <Tile
          label={t('stats.totalTime')}
          value={formatStudyTime(stats.timeTotal)}
          spoken={formatStudyTimeLong(stats.timeTotal)}
        />
      </View>

      <Text accessibilityRole="header" style={styles.heading}>
        {t('stats.lastWeek')}
      </Text>
      <View style={styles.chart}>
        {stats.lastWeek.map(({ day, cards: n, newCards }, i) => (
          <View
            key={i}
            style={styles.barColumn}
            accessible
            accessibilityLabel={`${dayLabel(i - last, day)}: ${split(n, newCards)}`}
          >
            <Text style={styles.barValue} numberOfLines={1}>
              {count(n)}
            </Text>
            {/* New cards stacked on top of reviews. */}
            <View
              style={[
                styles.bar,
                { height: Math.max(4, (n / max) * BAR_MAX_HEIGHT) },
                n === 0 && styles.barEmpty,
              ]}
            >
              <View style={[styles.barNew, { flex: newCards }]} />
              <View style={{ flex: n - newCards }} />
            </View>
            <Text style={styles.barLabel} numberOfLines={1}>
              {dayLabel(i - last, day, true)}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.legend} importantForAccessibility="no-hide-descendants">
        <View style={[styles.swatch, styles.swatchReview]} />
        <Text style={styles.legendText}>{t('stats.reviews')}</Text>
        <View style={[styles.swatch, styles.barNew]} />
        <Text style={styles.legendText}>{t('stats.newCards')}</Text>
      </View>
    </ScrollView>
  );
}

/** "26 reviews · 8 new" */
function split(cards: number, newCards: number): string {
  return t('stats.split', { reviews: tn('count.review', cards - newCards), n: newCards });
}

function Tile({
  label,
  value,
  spoken = value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  /** A small line under the label, e.g. "26 reviews · 8 new". */
  detail?: string;
  /** How a screen reader says `value`, if different (e.g. "1 hour 5 minutes" for "1 h 5 min"). */
  spoken?: string;
  icon?: ReactNode;
}) {
  return (
    <View
      style={styles.tile}
      accessible
      accessibilityLabel={[`${label}: ${spoken}`, detail].filter(Boolean).join('. ')}
    >
      <View style={styles.tileTop}>
        {icon}
        <Text style={styles.tileValue}>{value}</Text>
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
      {detail ? <Text style={styles.tileDetail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
    borderRadius: radius.card,
    padding: 16,
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tileValue: {
    flexShrink: 1,
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  tileLabel: { fontSize: 14, color: colors.muted, marginTop: 4, textAlign: 'center' },
  tileDetail: { fontSize: 13, color: colors.muted, marginTop: 2, textAlign: 'center' },
  heading: { fontSize: 17, fontWeight: '600', color: colors.text, marginTop: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  barColumn: { flex: 1, alignItems: 'center', gap: 6 },
  barValue: { fontSize: 13, color: colors.muted },
  bar: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barNew: { backgroundColor: colors.chartNew },
  barEmpty: { backgroundColor: colors.hairline },
  barLabel: { fontSize: 13, color: colors.muted },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3, marginLeft: 10 },
  swatchReview: { backgroundColor: colors.primary },
  legendText: { fontSize: 13, color: colors.muted },
});
