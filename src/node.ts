// ============================================================
// TeX Board — node.ts
// Per-node rendering, events, and lifecycle.
// ============================================================

import type { ConnectDragState, Direction } from './types';
import { svgCanvas }              from './canvas';
import { showToast }              from './toast';
import { debounce }               from './utils';
import {
  removeConnectionsForNode,
  scheduleConnectionUpdate,
  markConnectionsDirty,
  finalizeConnection,
  getDotPoint,
  updateLinePath,
} from './connections';
import DOMPurify from 'dompurify';

// ---- Drag-to-connect state --------------------------------
const drag: ConnectDragState = {
  active:     false,
  line:       null,
  sourceNode: null,
  sourceDir:  null,
};

// ---- ResizeObserver registry ------------------------------
// Stored in a WeakMap so observers are garbage-collected with their node
// and can be explicitly disconnected on delete to prevent leaks.
const _resizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

// ---- MathJax startup promise ------------------------------
function mjReady(): Promise<void> {
  return window.MathJax?.startup?.promise ?? Promise.resolve();
}

// ---- DOMPurify config -------------------------------------
// Restrict to the subset of tags MathJax and basic rich text need.
// Dropping ALLOWED_ATTR prevents any inline event-handler injection.
const PURIFY_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: ['span', 'br', 'b', 'i', 'em', 'strong', 'sup', 'sub'],
  ALLOWED_ATTR: [],
};

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

  // MathJax renders only text inside explicit delimiters; plain text is
  // left untouched. Sanitize before injecting into the DOM.
  preview.innerHTML = DOMPurify.sanitize(raw, PURIFY_CONFIG);

  if (typeof window.MathJax?.typesetPromise === 'function') {
    // Fast path: engine already initialised.
    window.MathJax.typesetPromise([preview]).then(() => {
      markConnectionsDirty(container);
      scheduleConnectionUpdate();
    });
  } else {
    // Slow path: wait for MathJax 4 startup promise.
    mjReady().then(() => {
      window.MathJax.typesetPromise?.([preview]).then(() => {
        markConnectionsDirty(container);
        scheduleConnectionUpdate();
      });
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

  // Live preview while typing — debounced to avoid hammering MathJax.
  const debouncedRender = debounce(() => renderMath(container), 400);
  textarea.addEventListener('input', debouncedRender);

  preview.addEventListener('click', () => {
    if (drag.active) return;
    container.classList.add('editing');
    textarea.focus();
  });

  // Resize → sync preview size, mark dirty, schedule redraw.
  // The observer is stored so deleteNode() can disconnect it.
  const ro = new ResizeObserver(() => {
    syncPreviewSize(container);
    markConnectionsDirty(container);
    scheduleConnectionUpdate();
  });
  ro.observe(textarea);
  _resizeObservers.set(container, ro);

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
  // Disconnect the ResizeObserver before removing the node to prevent
  // the callback firing on a detached element and leaking memory.
  _resizeObservers.get(container)?.disconnect();
  _resizeObservers.delete(container);

  removeConnectionsForNode(container);
  Object.assign(container.style, {
    transition: 'opacity 0.2s, transform 0.2s',
    opacity:    '0',
    transform:  'scale(0.9)',
  });
  setTimeout(() => container.remove(), 200);
  showToast('Node deleted');
}