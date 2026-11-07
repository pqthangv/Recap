// What the tour points at: a screen marks a button with `ref={useTourTarget('study')}`, and the
// tour measures it when its step shows (features/tour/TourOverlay.tsx).
import { useCallback } from 'react';
import type { View } from 'react-native';

import type { TargetId } from './steps';

export type Rect = { x: number; y: number; width: number; height: number };

const nodes = new Map<TargetId, View>();

export function useTourTarget(id: TargetId): (node: View | null) => () => void {
  return useCallback(
    (node: View | null) => {
      // Pressable merges refs and calls this with null when the button goes, without the cleanup
      // (React detaches before it attaches, so a button that's drawn again ends up kept).
      if (node) nodes.set(id, node);
      else nodes.delete(id);
      return () => {
        if (nodes.get(id) === node) nodes.delete(id);
      };
    },
    [id],
  );
}

/** Where the button is in the window, or null while it isn't on screen (or has no size). */
export function measureTarget(id: TargetId): Promise<Rect | null> {
  const node = nodes.get(id);
  if (!node) return Promise.resolve(null);
  return new Promise((resolve) =>
    node.measureInWindow((x, y, width, height) =>
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null),
    ),
  );
}
