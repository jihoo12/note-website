// ============================================================
// TeX Board — connections.ts
// ============================================================

import type { Connection, Direction, DotPair, Point } from './types';
import { svgCanvas } from './canvas';
import { showToast }  from './toast';

export const connections: Connection[] = [];

// ---- RAF-throttled update scheduler -----------------------
// Coalesces every updateAllConnections() request that arrives in
// the same animation frame into a single DOM read/write pass.
let _rafId: number | null = null;

export function scheduleConnectionUpdate(): void {
  if (_rafId !== null) return;   // already queued for this frame
  _rafId = requestAnimationFrame(() => {
    _rafId = null;
    updateAllConnections();
  });
}

// ---- Dirty-flag helpers ------------------------------------
/**
 * Mark the dot-pair as stale so the next updateAllConnections() call
 * re-runs the 16-BCR getBestDotPair check.
 *
 * Pass a node element to mark only connections touching that node
 * (used during node drag). Omit to mark every connection dirty
 * (used after viewport pan/zoom).
 */
export function markConnectionsDirty(node?: HTMLElement): void {
  for (const conn of connections) {
    if (!node || conn.from === node || conn.to === node) {
      conn.dirtyDots = true;
    }
  }
}

// ---- Pixel-center of a directional dot --------------------
export function getDotPoint(container: HTMLElement, dir: Direction): Point {
  const dot = container.querySelector<HTMLElement>(`.node-connect-dot[data-dir="${dir}"]`);
  if (!dot) return getNodeCenter(container);
  const r = dot.getBoundingClientRect();
  return {
    x: r.left + r.width  / 2 + window.scrollX,
    y: r.top  + r.height / 2 + window.scrollY,
  };
}

export function getNodeCenter(container: HTMLElement): Point {
  const r = container.getBoundingClientRect();
  return {
    x: r.left + r.width  / 2 + window.scrollX,
    y: r.top  + r.height / 2 + window.scrollY,
  };
}

// ---- Closest dot pair between two nodes -------------------
export function getBestDotPair(
  fromContainer: HTMLElement,
  toContainer:   HTMLElement,
): DotPair {
  const dirs: Direction[] = ['top', 'right', 'bottom', 'left'];
  let best: DotPair = { fromDir: 'right', toDir: 'left' };
  let bestDist = Infinity;

  for (const fd of dirs) {
    for (const td of dirs) {
      const fp   = getDotPoint(fromContainer, fd);
      const tp   = getDotPoint(toContainer,   td);
      const dist = Math.hypot(fp.x - tp.x, fp.y - tp.y);
      if (dist < bestDist) { bestDist = dist; best = { fromDir: fd, toDir: td }; }
    }
  }
  return best;
}

// ---- Bézier control-point for one end of the curve --------
function controlPoint(
  dir:    Direction | null,
  anchor: Point,
  other:  Point,
  t:      number,
): Point {
  switch (dir) {
    case 'right':  return { x: anchor.x + t, y: anchor.y };
    case 'left':   return { x: anchor.x - t, y: anchor.y };
    case 'bottom': return { x: anchor.x,     y: anchor.y + t };
    case 'top':    return { x: anchor.x,     y: anchor.y - t };
    default: {
      const dx = other.x > anchor.x ? t : -t;
      return { x: anchor.x + dx, y: anchor.y };
    }
  }
}

// ---- Direction-aware cubic Bézier path --------------------
export function updateLinePath(
  lineEl:  SVGPathElement,
  x1: number, y1: number,
  x2: number, y2: number,
  fromDir: Direction | null,
  toDir:   Direction | null,
): void {
  const dist    = Math.hypot(x2 - x1, y2 - y1);
  const tension = Math.max(40, dist * 0.45);

  const start = { x: x1, y: y1 };
  const end   = { x: x2, y: y2 };
  const c1    = controlPoint(fromDir, start, end,   tension);
  const c2    = controlPoint(toDir,   end,   start, tension);

  lineEl.setAttribute('d',
    `M ${x1} ${y1} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${x2} ${y2}`
  );
}

// ---- Re-draw every connection ------------------------------
// Uses cached fromDir/toDir when dirtyDots === false, saving up to
// 14 getBoundingClientRect calls per connection per frame.
export function updateAllConnections(): void {
  for (const conn of connections) {
    if (conn.dirtyDots) {
      const best   = getBestDotPair(conn.from, conn.to);
      conn.fromDir = best.fromDir;
      conn.toDir   = best.toDir;
      conn.dirtyDots = false;
    }

    const s = getDotPoint(conn.from, conn.fromDir);
    const e = getDotPoint(conn.to,   conn.toDir);
    updateLinePath(conn.path, s.x, s.y, e.x, e.y, conn.fromDir, conn.toDir);

    const mx = (s.x + e.x) / 2;
    const my = (s.y + e.y) / 2;
    conn.deleteBtn.setAttribute('transform', `translate(${mx}, ${my})`);
  }
}

// ---- Permanent connection with delete button --------------
export function finalizeConnection(
  fromContainer: HTMLElement,
  toContainer:   HTMLElement,
): void {
  const duplicate = connections.some(
    c => (c.from === fromContainer && c.to === toContainer)
      || (c.from === toContainer   && c.to === fromContainer),
  );
  if (duplicate) { showToast('Connection already exists'); return; }

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', 'connection-path');
  svgCanvas.appendChild(path);

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'conn-delete-btn');
  g.style.pointerEvents = 'all';
  g.innerHTML = `
    <circle r="9" cx="0" cy="0"/>
    <path d="M-4 -4 L4 4 M4 -4 L-4 4" stroke-width="1.5" stroke-linecap="round"/>
  `;
  g.addEventListener('click', () => removeConnection(path));
  svgCanvas.appendChild(g);

  // We just called getBestDotPair so dirtyDots starts false.
  const best: DotPair = getBestDotPair(fromContainer, toContainer);
  connections.push({
    from: fromContainer,
    to:   toContainer,
    path,
    deleteBtn: g,
    dirtyDots: false,
    ...best,
  });
  updateAllConnections();
  showToast('Nodes connected');
}

function removeConnection(path: SVGPathElement): void {
  const idx = connections.findIndex(c => c.path === path);
  if (idx === -1) return;
  connections[idx].path.remove();
  connections[idx].deleteBtn.remove();
  connections.splice(idx, 1);
  showToast('Connection removed');
}

// ---- Remove all connections for a given node --------------
export function removeConnectionsForNode(container: HTMLElement): void {
  for (let i = connections.length - 1; i >= 0; i--) {
    const c = connections[i];
    if (c.from === container || c.to === container) {
      c.path.remove();
      c.deleteBtn.remove();
      connections.splice(i, 1);
    }
  }
}

// ---- Clear every connection --------------------------------
export function clearAllConnections(): void {
  connections.forEach(c => { c.path.remove(); c.deleteBtn.remove(); });
  connections.length = 0;
}