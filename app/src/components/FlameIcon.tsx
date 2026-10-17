import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { useColors } from '@/lib/theme';

/** The Material fire icon for the study streak. Grey when `lit` is false (no streak). */
export function FlameIcon({ size = 24, lit = true }: { size?: number; lit?: boolean }) {
  const colors = useColors();
  return (
    <MaterialIcons
      name="local-fire-department"
      size={size}
      color={lit ? colors.flame : colors.muted}
      importantForAccessibility="no"
      accessibilityElementsHidden
    />
  );
}
