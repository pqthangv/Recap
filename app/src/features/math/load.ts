// MathJax is ~1.5 MB of JavaScript, so it loads the first time something shows a formula and then
// stays. Drawn formulas are kept too (most recently used first), so going back and forth through
// a study session or re-rendering a list doesn't draw them again.
import { useEffect, useSyncExternalStore } from 'react';

import type { MathResult } from '@/lib/math/tex';

import { importTex } from './importTex';

type Tex = Awaited<ReturnType<typeof importTex>>;

let tex: Tex | null = null;
let loading: Promise<Tex> | null = null;
const listeners = new Set<() => void>();

export function loadMath(): Promise<Tex> {
  loading ??= importTex().then((m) => {
    tex = m;
    for (const listener of listeners) listener();
    return m;
  });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const isLoaded = () => tex !== null;

/** Starts loading MathJax; true once it can draw. Components redraw when it's ready (a value
 * React sees, so the React Compiler doesn't keep a drawing made before MathJax was there). */
export function useMathReady(): boolean {
  const ready = useSyncExternalStore(subscribe, isLoaded, isLoaded);
  useEffect(() => {
    if (!ready) void loadMath();
  }, [ready]);
  return ready;
}

const KEEP = 300;
const drawn = new Map<string, MathResult>();

/** The formula drawn, or null while MathJax is still loading (see `useMathReady`). */
export function drawMath(formula: string, display: boolean): MathResult | null {
  if (!tex) return null;
  const key = (display ? 'D' : 'I') + formula;
  let out = drawn.get(key);
  if (out) drawn.delete(key);
  else out = tex.texToSvg(formula, display);
  drawn.set(key, out);
  if (drawn.size > KEEP) drawn.delete(drawn.keys().next().value as string);
  return out;
}

/** Whether MathJax knows `\name` (true until it's loaded, so nothing is flagged too early). */
export function knowsCommand(name: string): boolean {
  return tex ? tex.knowsCommand(name) : true;
}
