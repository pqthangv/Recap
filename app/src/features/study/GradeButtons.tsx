import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { formatInterval, formatIntervalLong } from '@/lib/format';
import {
  FOUR_BUTTON_GRADES,
  Rating,
  TWO_BUTTON_GRADES,
  type Grade,
  type Preview,
} from '@/lib/scheduler';

const TWO_LABELS: Partial<Record<Grade, string>> = {
  [Rating.Again]: 'Forgot',
  [Rating.Good]: 'Got it',
};
const FOUR_LABELS: Record<Grade, string> = {
  [Rating.Again]: 'Again',
  [Rating.Hard]: 'Hard',
  [Rating.Good]: 'Good',
  [Rating.Easy]: 'Easy',
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
        const name = (fourButtons ? FOUR_LABELS[grade] : TWO_LABELS[grade]) ?? '';
        const ms = previews[grade].intervalMs;
        return (
          <Button
            key={grade}
            label={fourButtons ? name : `${name} · ${formatInterval(ms)}`}
            sublabel={fourButtons ? formatInterval(ms) : undefined}
            accessibilityLabel={`${name}, see it again ${formatIntervalLong(ms)}`}
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
