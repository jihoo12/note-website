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
import { onNodeDeleted }  from './groups';
import DOMPurify from 'dompurify';

// ---- Drag-to-connect state --------------------------------
const drag: ConnectDragState = {
  active:     false,
  line:       null,
  sourceNode: null,
  sourceDir:  null,
};

// ---- ResizeObserver registry ------------------------------
const _resizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

// ---- MathJax startup promise ------------------------------
function mjReady(): Promise<void> {
  return window.MathJax?.startup?.promise ?? Promise.resolve();
}

// ---- DOMPurify config -------------------------------------
const PURIFY_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: [
    'span', 'br', 'b', 'i', 'em', 'strong', 'sup', 'sub',
    'p', 'div', 'h1', 'h2', 'h3', 'ul', 'ol', 'li',
    'a', 'iframe',
    'code','pre'
  ],
  ALLOWED_ATTR: [
    'style', 'class',
    'href', 'target',
    'alt', 'width',
    'height', 'frameborder',
  ],
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

  preview.innerHTML = DOMPurify.sanitize(raw, PURIFY_CONFIG);

  const highlight = () => {
    if (typeof window.Prism !== 'undefined') {
      window.Prism.highlightAllUnder(preview);
    }
  };

  if (typeof window.MathJax?.typesetPromise === 'function') {
    window.MathJax.typesetPromise([preview]).then(() => {
      highlight();
      markConnectionsDirty(container);
      scheduleConnectionUpdate();
    });
  } else {
    mjReady().then(() => {
      window.MathJax.typesetPromise?.([preview]).then(() => {
        highlight();
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

  textarea.addEventListener('focus', () => container.classList.add('editing'));
  textarea.addEventListener('blur',  () => {
    container.classList.remove('editing');
    renderMath(container);
  });

  const debouncedRender = debounce(() => renderMath(container), 400);
  textarea.addEventListener('input', debouncedRender);

  preview.addEventListener('click', () => {
    if (drag.active) return;
    container.classList.add('editing');
    textarea.focus();
  });

  const ro = new ResizeObserver(() => {
    syncPreviewSize(container);
    markConnectionsDirty(container);
    scheduleConnectionUpdate();
  });
  ro.observe(textarea);
  _resizeObservers.set(container, ro);

  deleteBtn.addEventListener('click', e => {
    e.stopPropagation();
    deleteNode(container);
  });

  titleInput.addEventListener('mousedown', e => e.stopPropagation());

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
  _resizeObservers.get(container)?.disconnect();
  _resizeObservers.delete(container);

  // Remove from any group membership before removing from DOM.
  onNodeDeleted(container);

  removeConnectionsForNode(container);
  Object.assign(container.style, {
    transition: 'opacity 0.2s, transform 0.2s',
    opacity:    '0',
    transform:  'scale(0.9)',
  });
  setTimeout(() => container.remove(), 200);
  showToast('Node deleted');
}