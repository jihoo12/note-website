// ============================================================
// TeX Board — nodeDrag.ts
// Handles moving nodes AND groups around the infinite canvas.
// Groups use a flat-DOM approach: nodes remain in canvas-layer
// and membership is tracked logically via groups.ts.
// ============================================================

import { markConnectionsDirty, scheduleConnectionUpdate } from './connections';
import { isDraggingConnection } from './node';
import { getScale, isSpaceHeld, isCtrlHeld, isPanningNow } from './viewport';
import { joinGroup, leaveGroup, getGroupMembersRecursive, isDescendantOf } from './groups';

const canvasLayer = document.getElementById('canvas-layer') as HTMLElement;

/**
 * Approximate group header height in CSS (unscaled) pixels.
 * The body drop-zone starts below this strip.
 */
const HEADER_PX = 40;

interface DragState {
  el: HTMLElement | null;
  isGroup: boolean;
  offsetX: number;
  offsetY: number;
  /** Previous canvas-local position — used to compute per-frame delta for group moves. */
  prevX: number;
  prevY: number;
}

const state: DragState = {
  el: null, isGroup: false,
  offsetX: 0, offsetY: 0,
  prevX: 0, prevY: 0,
};

// ── mousedown ──────────────────────────────────────────────
document.addEventListener('mousedown', (e: MouseEvent) => {
  if (isDraggingConnection()) return;
  if (isSpaceHeld()) return;
  if (isCtrlHeld()) return;

  const handle = (e.target as Element).closest<HTMLElement>('.drag-handle');
  if (!handle) return;

  // A .drag-handle can live inside a .draggable-container (node)
  // or a .group-container (group header).  Prefer the node when both match.
  const nodeEl = handle.closest<HTMLElement>('.draggable-container');
  const groupEl = handle.closest<HTMLElement>('.group-container');
  const target = nodeEl ?? groupEl;
  if (!target) return;

  const isGroup = !nodeEl && !!groupEl;

  state.el = target;
  state.isGroup = isGroup;

  const rect = target.getBoundingClientRect();
  state.offsetX = e.clientX - rect.left;
  state.offsetY = e.clientY - rect.top;
  state.prevX = parseFloat(target.style.left) || 0;
  state.prevY = parseFloat(target.style.top) || 0;

  if (isGroup) {
    // Raise the group above siblings while dragging.
    target.style.zIndex = '50';
    // Raise all recursive member nodes/groups above this group.
    getGroupMembersRecursive(target).forEach((m: HTMLElement) => { m.style.zIndex = '60'; });

  } else {
    // Reset all nodes, then elevate the dragged one.
    document.querySelectorAll<HTMLElement>('.draggable-container').forEach(el => {
      el.style.zIndex = '2';
    });
    target.style.zIndex = '100';
  }

  target.classList.add('is-dragging');
  e.preventDefault();
});

// ── mousemove ──────────────────────────────────────────────
document.addEventListener('mousemove', (e: MouseEvent) => {
  const { el, isGroup, offsetX, offsetY } = state;
  if (!el) return;

  if (isPanningNow()) {
    el.classList.remove('is-dragging');
    state.el = null;
    return;
  }

  const cl = canvasLayer.getBoundingClientRect();
  const s = getScale();
  const newX = (e.clientX - offsetX - cl.left) / s;
  const newY = (e.clientY - offsetY - cl.top) / s;

  el.style.left = `${newX}px`;
  el.style.top = `${newY}px`;

  if (isGroup) {
    // Apply the same canvas-local delta to every recursive member (nodes & subgroups).
    const dX = newX - state.prevX;
    const dY = newY - state.prevY;
    state.prevX = newX;
    state.prevY = newY;
    getGroupMembersRecursive(el).forEach((m: HTMLElement) => {
      m.style.left = `${parseFloat(m.style.left) + dX}px`;
      m.style.top = `${parseFloat(m.style.top) + dY}px`;
      markConnectionsDirty(m);
    });
  } else {
    markConnectionsDirty(el);
  }

  // Always check for drop highlights and membership updates for both nodes AND groups.
  _updateDropHighlight(el);
  scheduleConnectionUpdate();
});


// ── mouseup ────────────────────────────────────────────────
document.addEventListener('mouseup', () => {
  const { el, isGroup } = state;
  if (!el) return;

  el.classList.remove('is-dragging');
  _clearDropHighlights();

  if (isGroup) {
    el.style.zIndex = '1';
    getGroupMembersRecursive(el).forEach((m: HTMLElement) => { m.style.zIndex = '2'; });

  } else {
    el.style.zIndex = '2';
  }

  _resolveGroupMembership(el);


  Object.assign(state, { el: null, isGroup: false, prevX: 0, prevY: 0 });
});

// ── drop-target highlight ──────────────────────────────────

function _updateDropHighlight(el: HTMLElement): void {
  _clearDropHighlights();
  const { cx, cy } = _center(el);
  const s = getScale();
  document.querySelectorAll<HTMLElement>('.group-container').forEach(g => {
    // A group cannot be dropped into itself or its own descendants.
    if (g === el || isDescendantOf(g, el)) return;

    const r = g.getBoundingClientRect();
    // The drop zone is the body area below the header.
    if (cx >= r.left && cx <= r.right &&
      cy >= r.top + HEADER_PX * s && cy <= r.bottom) {
      g.classList.add('drop-target');
    }
  });
}


function _clearDropHighlights(): void {
  document.querySelectorAll<HTMLElement>('.group-container.drop-target')
    .forEach(el => el.classList.remove('drop-target'));
}

// ── group membership resolution on drop ───────────────────

function _resolveGroupMembership(el: HTMLElement): void {
  const { cx, cy } = _center(el);
  const s = getScale();
  let target: HTMLElement | null = null;

  document.querySelectorAll<HTMLElement>('.group-container').forEach(g => {
    // A group cannot be a member of itself or its own descendants.
    if (g === el || isDescendantOf(g, el)) return;

    const r = g.getBoundingClientRect();
    if (cx >= r.left && cx <= r.right &&
      cy >= r.top + HEADER_PX * s && cy <= r.bottom) {
      target = g;
    }
  });

  if (target) {
    joinGroup(el, target as HTMLElement);
  } else {
    leaveGroup(el);
  }
}


function _center(el: HTMLElement): { cx: number; cy: number } {
  const r = el.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}