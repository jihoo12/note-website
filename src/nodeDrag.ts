// ============================================================
// TeX Board — nodeDrag.ts
// Handles moving nodes around the workspace via drag-handle.
// ============================================================

/*
import { updateAllConnections } from './connections';
import { isDraggingConnection } from './node';

const workspace = document.getElementById('workspace') as HTMLDivElement;

interface DragState {
  node:    HTMLElement | null;
  offsetX: number;
  offsetY: number;
}

const state: DragState = { node: null, offsetX: 0, offsetY: 0 };

document.addEventListener('mousedown', (e: MouseEvent) => {
  if (isDraggingConnection()) return;

  const handle    = (e.target as Element).closest<HTMLElement>('.drag-handle');
  const container = handle?.closest<HTMLElement>('.draggable-container');
  if (!container) return;

  state.node    = container;
  const rect    = container.getBoundingClientRect();
  state.offsetX = e.clientX - rect.left;
  state.offsetY = e.clientY - rect.top;

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

  const wr            = workspace.getBoundingClientRect();
  const toolbar       = document.querySelector<HTMLElement>('.toolbar');
  const toolbarBottom = toolbar
    ? toolbar.getBoundingClientRect().bottom - wr.top + 10
    : 0;

  const x = clamp(
    e.clientX - wr.left - offsetX + workspace.scrollLeft,
    0,
    wr.width - node.offsetWidth,
  );
  const y = clamp(
    e.clientY - wr.top - offsetY + workspace.scrollTop,
    toolbarBottom,
    wr.height - node.offsetHeight,
  );

  node.style.left = `${x}px`;
  node.style.top  = `${y}px`;
  updateAllConnections();
});

document.addEventListener('mouseup', () => {
  if (!state.node) return;
  state.node.classList.remove('is-dragging');
  state.node = null;
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
*/

// ============================================================
// TeX Board — nodeDrag.ts
// Handles moving nodes around the infinite canvas.
// Positions are in canvas-local coordinates so that pan/zoom
// never shifts nodes relative to the canvas.
// ============================================================

import { updateAllConnections }            from './connections';
import { isDraggingConnection }            from './node';
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
  // At mousedown:  offsetX = clientX_down − node_screen_left
  //                node_screen_left = cl.left + node.offsetLeft × scale
  //
  // We want:       node.style.left  = (desired_screen_left − cl.left) / scale
  //                desired_screen_left = clientX − offsetX
  //
  // So:            node.style.left = (clientX − offsetX − cl.left) / scale
  //
  // This means the node moves proportionally to the mouse delta in canvas
  // space, keeping the grab point fixed under the cursor at any zoom level.
  const cl = canvasLayer.getBoundingClientRect();
  const s  = getScale();

  node.style.left = `${(e.clientX - offsetX - cl.left) / s}px`;
  node.style.top  = `${(e.clientY - offsetY - cl.top)  / s}px`;

  updateAllConnections();
});

document.addEventListener('mouseup', () => {
  if (!state.node) return;
  state.node.classList.remove('is-dragging');
  state.node = null;
});