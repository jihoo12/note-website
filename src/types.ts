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
  /**
   * When true, the next updateAllConnections() call will re-run
   * getBestDotPair (16 getBoundingClientRect calls).
   * When false, the cached fromDir/toDir are reused (2 calls).
   * Set to true whenever a connected node moves, resizes, or the
   * viewport is panned/zoomed.
   */
  dirtyDots: boolean;
}

// ---- Persistence --------------------------------------------

/** Serialisable snapshot of one node. */
export interface NodeRecord {
  id:      string;   // UUID — used to re-wire connections on load
  title:   string;
  content: string;   // raw textarea text
  x:       number;   // canvas-local left px
  y:       number;   // canvas-local top  px
  width:   number;   // editor-wrapper width  px
  height:  number;   // editor-wrapper height px
}

/** Serialisable snapshot of one connection. */
export interface ConnectionRecord {
  fromId: string;
  toId:   string;
}

/** Full board snapshot written to / read from JSON. */
export interface BoardData {
  version:     1;
  nodes:       NodeRecord[];
  connections: ConnectionRecord[];
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
      typesetPromise?: (nodes: Element[]) => Promise<void>;
      startup?: {
        promise: Promise<void>;
      };
      tex?:     object;
      options?: object;
      output?:  object;
    };
  }
}