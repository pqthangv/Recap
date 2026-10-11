import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLive } from '@/db/live';
import { getStats } from '@/db/stats';
import { plural } from '@/lib/format';
import { colors, radius } from '@/lib/theme';

const BAR_MAX_HEIGHT = 140;

function dayLabel(offset: number, day: number): string {
  if (offset === 0) return 'Today';
  return new Date(day).toLocaleDateString(undefined, { weekday: 'short' });
}

export default function StatsScreen() {
  const stats = useLive(() => getStats(), ['review_logs', 'cards', 'decks']);
  const max = Math.max(1, ...stats.forecast.map((d) => d.count));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.tiles}>
        <Tile label="Reviewed today" value={String(stats.reviewedToday)} />
        <Tile label="Streak" value={plural(stats.streak, 'day')} />
      </View>

      <Text accessibilityRole="header" style={styles.heading}>
        Cards due, next 7 days
      </Text>
      <View style={styles.chart}>
        {stats.forecast.map(({ day, count: n }, i) => (
          <View
            key={i}
            style={styles.barColumn}
            accessible
            accessibilityLabel={`${dayLabel(i, day)}: ${plural(n, 'card')}`}
          >
            <Text style={styles.barValue}>{n}</Text>
            <View
              style={[
                styles.bar,
                { height: Math.max(4, (n / max) * BAR_MAX_HEIGHT) },
                n === 0 && styles.barEmpty,
              ]}
            />
            <Text style={styles.barLabel} numberOfLines={1}>
              {dayLabel(i, day)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, backgroundColor: colors.tint, borderRadius: radius.card, padding: 16 },
  tileValue: { fontSize: 28, fontWeight: '700', color: colors.text },
  tileLabel: { fontSize: 14, color: colors.muted, marginTop: 4 },
  heading: { fontSize: 17, fontWeight: '600', color: colors.text, marginTop: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  barColumn: { flex: 1, alignItems: 'center', gap: 6 },
  barValue: { fontSize: 13, color: colors.muted },
  bar: { alignSelf: 'stretch', backgroundColor: colors.primary, borderRadius: 6 },
  barEmpty: { backgroundColor: colors.hairline },
  barLabel: { fontSize: 13, color: colors.muted },
});
