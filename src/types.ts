// ============================================================
// TeX Board — types.ts
// ============================================================

export type Direction = 'top' | 'right' | 'bottom' | 'left';

export interface Point {
  x: number;
  y: number;
}

export interface DotPair {
  fromDir: Direction;
  toDir:   Direction;
}

export interface Connection {
  from:      HTMLElement;
  to:        HTMLElement;
  path:      SVGPathElement;
  deleteBtn: SVGGElement;
  fromDir:   Direction;
  toDir:     Direction;
}

/** All mutable state for an in-progress drag-to-connect gesture. */
export interface ConnectDragState {
  active:     boolean;
  line:       SVGPathElement | null;
  sourceNode: HTMLElement    | null;
  sourceDir:  Direction      | null;
}

declare global {
  interface Window {
    MathJax: {
      // Core typesetting API — unchanged from v3
      typesetPromise?: (nodes: Element[]) => Promise<void>;
      // v4: startup.promise resolves once the engine is fully initialised.
      // v3: startup.defaultReady was a mutable hook — removed in v4.
      startup?: {
        promise: Promise<void>;
      };
      tex?:     object;
      options?: object;
      output?:  object;
    };
  }
}