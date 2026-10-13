import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { formatInterval, formatIntervalLong } from '@/lib/format';
import { t, type StringKey } from '@/lib/i18n';
import {
  FOUR_BUTTON_GRADES,
  Rating,
  TWO_BUTTON_GRADES,
  type Grade,
  type Preview,
} from '@/lib/scheduler';

const TWO_LABELS: Partial<Record<Grade, StringKey>> = {
  [Rating.Again]: 'grade.forgot',
  [Rating.Good]: 'grade.gotIt',
};
const FOUR_LABELS: Record<Grade, StringKey> = {
  [Rating.Again]: 'grade.again',
  [Rating.Hard]: 'grade.hard',
  [Rating.Good]: 'grade.good',
  [Rating.Easy]: 'grade.easy',
};

type Props = {
  previews: Record<Grade, Preview>;
  fourButtons: boolean;
  onGrade: (grade: Grade) => void;
};

/** "Forgot · 1m" / "Got it · 3d", or four buttons with the interval underneath. */
export function GradeButtons({ previews, fourButtons, onGrade }: Props) {
  const grades: readonly Grade[] = fourButtons ? FOUR_BUTTON_GRADES : TWO_BUTTON_GRADES;
  return (
    <View style={styles.row}>
      {grades.map((grade) => {
        const key = fourButtons ? FOUR_LABELS[grade] : TWO_LABELS[grade];
        const name = key ? t(key) : '';
        const ms = previews[grade].intervalMs;
        return (
          <Button
            key={grade}
            label={fourButtons ? name : `${name} · ${formatInterval(ms)}`}
            sublabel={fourButtons ? formatInterval(ms) : undefined}
            accessibilityLabel={t('grade.a11y', { name, when: formatIntervalLong(ms) })}
            variant={grade === Rating.Good ? 'primary' : 'secondary'}
            size="lg"
            onPress={() => onGrade(grade)}
            style={styles.button}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, paddingHorizontal: 6 },
});
