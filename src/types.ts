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
  toDir: Direction;
}

export interface Connection {
  from: HTMLElement;
  to: HTMLElement;
  path: SVGPathElement;
  deleteBtn: SVGGElement;
  fromDir: Direction;
  toDir: Direction;
  /**
   * When true, the next updateAllConnections() call will re-run
   * getBestDotPair (16 getBoundingClientRect calls).
   * When false, the cached fromDir/toDir are reused (2 calls).
   */
  dirtyDots: boolean;
}

// ---- Persistence --------------------------------------------

/** Serialisable snapshot of one node. */
export interface NodeRecord {
  id: string;
  title: string;
  content: string;   // raw textarea text
  x: number;   // canvas-local left px
  y: number;   // canvas-local top  px
  width: number;   // editor-wrapper width  px
  height: number;   // editor-wrapper height px
  groupId?: string;   // id of the parent group, if the node belongs to one
}

/** Serialisable snapshot of one group. */
export interface GroupRecord {
  id: string;
  title: string;
  x: number;   // canvas-local left px
  y: number;   // canvas-local top  px
  width: number;   // px
  height: number;   // px
  groupId?: string; // id of the parent group, if this group is nested
}


/** Serialisable snapshot of one connection (node ↔ node, node ↔ group, or group ↔ group). */
export interface ConnectionRecord {
  fromId: string;
  toId: string;
}

/** Full board snapshot written to / read from JSON. */
export interface BoardData {
  version: 1;
  nodes: NodeRecord[];
  connections: ConnectionRecord[];
  /**
   * Groups array.  Absent in boards saved before the groups feature was
   * added — loadBoard defaults it to [] for backward compatibility.
   */
  groups: GroupRecord[];
}

/** All mutable state for an in-progress drag-to-connect gesture. */
export interface ConnectDragState {
  active: boolean;
  line: SVGPathElement | null;
  sourceNode: HTMLElement | null;
  sourceDir: Direction | null;
}

declare global {
  interface Window {

    Prism?: {
      highlightAllUnder: (container: Element) => void;
    };
  }
}