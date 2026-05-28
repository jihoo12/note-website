// ============================================================
// TeX Board — nodeDrag.ts
// Handles moving nodes around the infinite canvas.
// Positions are in canvas-local coordinates so that pan/zoom
// never shifts nodes relative to the canvas.
// ============================================================

import { markConnectionsDirty, scheduleConnectionUpdate } from './connections';
import { isDraggingConnection }                           from './node';
import { getScale, isSpaceHeld, isCtrlHeld, isPanningNow } from './viewport';

// Canvas layer — nodes live inside this transformed element.
const canvasLayer = document.getElementById('canvas-layer') as HTMLElement;

interface DragState {
  node:    HTMLElement | null;
  offsetX: number;   // screen-space offset from node's left edge at drag start
  offsetY: number;   // screen-space offset from node's top  edge at drag start
}

const state: DragState = { node: null, offsetX: 0, offsetY: 0 };

document.addEventListener('mousedown', (e: MouseEvent) => {
  if (isDraggingConnection()) return;
  if (isSpaceHeld()) return;   // space held → pan gesture, not node drag
  if (isCtrlHeld())  return;   // ctrl  held → pan gesture, not node drag

  const handle    = (e.target as Element).closest<HTMLElement>('.drag-handle');
  const container = handle?.closest<HTMLElement>('.draggable-container');
  if (!container) return;

  state.node    = container;
  const rect    = container.getBoundingClientRect();
  state.offsetX = e.clientX - rect.left;
  state.offsetY = e.clientY - rect.top;

  // Bring dragged node above siblings.
  document.querySelectorAll<HTMLElement>('.draggable-container').forEach(el => {
    el.style.zIndex = '2';
  });
  container.style.zIndex = '100';
  container.classList.add('is-dragging');
  e.preventDefault();
});

document.addEventListener('mousemove', (e: MouseEvent) => {
  const { node, offsetX, offsetY } = state;
  if (!node) return;

  // If a pan gesture somehow started while dragging, abort the node drag.
  if (isPanningNow()) {
    node.classList.remove('is-dragging');
    state.node = null;
    return;
  }

  // Convert the desired screen position back to canvas-local coordinates.
  //
  //   node.style.left = (clientX − offsetX − canvasLayer.left) / scale
  //
  // This keeps the grab point fixed under the cursor at any zoom level.
  const cl = canvasLayer.getBoundingClientRect();
  const s  = getScale();

  node.style.left = `${(e.clientX - offsetX - cl.left) / s}px`;
  node.style.top  = `${(e.clientY - offsetY - cl.top)  / s}px`;

  // Only mark connections that involve this node as dirty — avoids
  // the 16-BCR getBestDotPair call for unrelated connections.
  markConnectionsDirty(node);
  scheduleConnectionUpdate();
});

document.addEventListener('mouseup', () => {
  if (!state.node) return;
  state.node.classList.remove('is-dragging');
  state.node = null;
});