// ============================================================
// TeX Board — node.ts
// Per-node rendering, events, and lifecycle.
// ============================================================

import type { ConnectDragState, Direction } from './types';
import { svgCanvas }              from './canvas';
import { showToast }              from './toast';
import {
  removeConnectionsForNode,
  updateAllConnections,
  finalizeConnection,
  getDotPoint,
  updateLinePath,
} from './connections';

// ---- Drag-to-connect state (single object, easy to reset) -
const drag: ConnectDragState = {
  active:     false,
  line:       null,
  sourceNode: null,
  sourceDir:  null,
};

// ---- MathJax 4 startup promise ----------------------------
// MathJax 4 guarantees window.MathJax.startup.promise resolves once the
// engine is fully initialised and typesetPromise is available.  We capture
// it once and reuse it for every node that tries to render before the engine
// is ready.  In the common case (engine already ready) typesetPromise exists
// immediately and we never even touch this promise.
function mjReady(): Promise<void> {
  return window.MathJax?.startup?.promise ?? Promise.resolve();
}

// ---- MathJax rendering ------------------------------------
export function renderMath(container: HTMLElement): void {
  const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
  const preview  = container.querySelector<HTMLDivElement>('.tex-preview')!;
  const raw      = textarea.value.trim();

  if (!raw) {
    preview.innerHTML =
      `<span style="color:var(--text-dim);font-size:12px;">${textarea.placeholder}</span>`;
    return;
  }

  // Wrap bare TeX in display-math delimiters if the user hasn't already added
  // any themselves (\[…\], \(…\), $…$, \begin{…}).
  const hasDelimiters = /(\\\[|\\\(|\$|\\begin\s*\{)/.test(raw);
  preview.innerHTML = hasDelimiters ? raw : `\\[${raw}\\]`;

  if (typeof window.MathJax?.typesetPromise === 'function') {
    // Fast path: engine already initialised.
    window.MathJax.typesetPromise([preview]).then(updateAllConnections);
  } else {
    // Slow path: wait for MathJax 4's startup promise then typeset.
    // This replaces the fragile defaultReady monkey-patch used in v3.
    mjReady().then(() => {
      window.MathJax.typesetPromise?.([preview]).then(updateAllConnections);
    });
  }
}

// ---- Sync preview dimensions to the resizable textarea ----
function syncPreviewSize(container: HTMLElement): void {
  const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
  const preview  = container.querySelector<HTMLDivElement>('.tex-preview')!;
  const wrapper  = container.querySelector<HTMLDivElement>('.editor-wrapper')!;
  const { offsetWidth: w, offsetHeight: h } = textarea;
  if (w > 0 && h > 0) {
    wrapper.style.width  = preview.style.width  = `${w}px`;
    wrapper.style.height = preview.style.height = `${h}px`;
  }
}

// ---- Attach all events to a freshly created node ----------
export function attachEditorEvents(container: HTMLElement): void {
  container.id = crypto.randomUUID();

  const textarea   = container.querySelector<HTMLTextAreaElement>('textarea')!;
  const preview    = container.querySelector<HTMLDivElement>('.tex-preview')!;
  const deleteBtn  = container.querySelector<HTMLButtonElement>('.node-delete')!;
  const titleInput = container.querySelector<HTMLInputElement>('.node-title')!;
  const dots       = container.querySelectorAll<HTMLElement>('.node-connect-dot');

  // Editing mode toggle
  textarea.addEventListener('focus', () => container.classList.add('editing'));
  textarea.addEventListener('blur',  () => {
    container.classList.remove('editing');
    renderMath(container);
  });

  preview.addEventListener('click', () => {
    if (drag.active) return;
    container.classList.add('editing');
    textarea.focus();
  });

  // Resize → sync preview size and redraw connections
  new ResizeObserver(() => {
    syncPreviewSize(container);
    updateAllConnections();
  }).observe(textarea);

  // Delete
  deleteBtn.addEventListener('click', e => {
    e.stopPropagation();
    deleteNode(container);
  });

  // Prevent title drag from bubbling to the node-drag handler
  titleInput.addEventListener('mousedown', e => e.stopPropagation());

  // Connect dots — drag always active (no mode toggle required)
  dots.forEach(dot => {
    dot.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      startConnectDrag(container, e as MouseEvent, dot.dataset['dir'] as Direction);
    });
  });

  renderMath(container);
}

// ---- Begin a preview connection line ----------------------
function startConnectDrag(
  container: HTMLElement,
  e: MouseEvent,
  dir: Direction,
): void {
  drag.active     = true;
  drag.sourceNode = container;
  drag.sourceDir  = dir;
  container.classList.add('connect-source');
  document.body.classList.add('drawing-mode');

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('class', 'preview-path');
  svgCanvas.appendChild(line);
  drag.line = line;

  const start = getDotPoint(container, dir);
  updateLinePath(line, start.x, start.y,
    e.clientX + window.scrollX, e.clientY + window.scrollY,
    dir, null);
}

// ---- Global mousemove (called from main.ts) ---------------
export function onMouseMove(e: MouseEvent): void {
  if (!drag.active || !drag.line || !drag.sourceNode || !drag.sourceDir) return;

  const start = getDotPoint(drag.sourceNode, drag.sourceDir);
  updateLinePath(drag.line, start.x, start.y,
    e.clientX + window.scrollX, e.clientY + window.scrollY,
    drag.sourceDir, null);

  clearHovers();
  const targetDot  = (e.target as Element).closest<HTMLElement>('.node-connect-dot');
  const targetNode = (e.target as Element).closest<HTMLElement>('.draggable-container');

  if (targetDot && targetDot.closest('.draggable-container') !== drag.sourceNode) {
    targetDot.classList.add('dot-target-hover');
  } else if (targetNode && targetNode !== drag.sourceNode) {
    targetNode.classList.add('connect-target-hover');
  }
}

// ---- Global mouseup (called from main.ts) -----------------
export function onMouseUp(e: MouseEvent): boolean {
  if (!drag.active || !drag.sourceNode) return false;

  const targetDot  = (e.target as Element).closest<HTMLElement>('.node-connect-dot');
  const targetNode = targetDot
    ? targetDot.closest<HTMLElement>('.draggable-container')
    : (e.target as Element).closest<HTMLElement>('.draggable-container');

  if (targetNode && targetNode !== drag.sourceNode) {
    finalizeConnection(drag.sourceNode, targetNode);
  }

  cleanupDrag();
  return true;
}

export function isDraggingConnection(): boolean {
  return drag.active;
}

// ---- Cleanup after a drag gesture -------------------------
function cleanupDrag(): void {
  drag.line?.remove();
  drag.sourceNode?.classList.remove('connect-source');
  Object.assign(drag, { active: false, line: null, sourceNode: null, sourceDir: null });
  clearHovers();
  document.body.classList.remove('drawing-mode');
}

function clearHovers(): void {
  document.querySelectorAll('.connect-target-hover, .dot-target-hover').forEach(el =>
    el.classList.remove('connect-target-hover', 'dot-target-hover'),
  );
}

// ---- Delete a node and its connections --------------------
function deleteNode(container: HTMLElement): void {
  removeConnectionsForNode(container);
  Object.assign(container.style, {
    transition: 'opacity 0.2s, transform 0.2s',
    opacity:    '0',
    transform:  'scale(0.9)',
  });
  setTimeout(() => container.remove(), 200);
  showToast('Node deleted');
}