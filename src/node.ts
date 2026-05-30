// ============================================================
// TeX Board — node.ts
// Per-node rendering, events, and lifecycle.
// ============================================================

import type { ConnectDragState, Direction } from './types';
import { svgCanvas } from './canvas';
import { showToast } from './toast';
import { debounce } from './utils';
import {
  removeConnectionsForNode,
  scheduleConnectionUpdate,
  markConnectionsDirty,
  finalizeConnection,
  getDotPoint,
  updateLinePath,
} from './connections';
import { onNodeDeleted } from './groups';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';
// @ts-ignore
import renderMathInElement from 'katex/dist/contrib/auto-render';


// ---- Drag-to-connect state --------------------------------
const drag: ConnectDragState = {
  active: false,
  line: null,
  sourceNode: null,
  sourceDir: null,
};

// ---- ResizeObserver registry ------------------------------
const _resizeObservers = new WeakMap<HTMLElement, ResizeObserver>();



// ---- DOMPurify config -------------------------------------
const PURIFY_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: [
    'span', 'br', 'b', 'i', 'em', 'strong', 'sup', 'sub',
    'p', 'div', 'h1', 'h2', 'h3', 'ul', 'ol', 'li',
    'a', 'iframe',
    'code', 'pre',
  ],
  ALLOWED_ATTR: [
    'style', 'class',
    'href', 'target',
    'alt', 'width',
    'height', 'frameborder',
  ],
};

// ---- KaTeX rendering ------------------------------------
export function renderMath(container: HTMLElement): void {
  const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
  const preview = container.querySelector<HTMLDivElement>('.tex-preview')!;
  const raw = textarea.value.trim();

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

  try {
    renderMathInElement(preview, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\begin{equation}', right: '\\end{equation}', display: true },
        { left: '\\begin{align}', right: '\\end{align}', display: true },
        { left: '\\begin{alignat}', right: '\\end{alignat}', display: true },
        { left: '\\begin{gather}', right: '\\end{gather}', display: true },
        { left: '\\begin{CD}', right: '\\end{CD}', display: true },

      ],
      throwOnError: false,
    });
    highlight();
    markConnectionsDirty(container);
    scheduleConnectionUpdate();
  } catch (err) {
    console.error('KaTeX rendering error:', err);
  }
}

// ---- Sync preview dimensions to the resizable textarea ----
function syncPreviewSize(container: HTMLElement): void {
  const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
  const preview = container.querySelector<HTMLDivElement>('.tex-preview')!;
  const wrapper = container.querySelector<HTMLDivElement>('.editor-wrapper')!;
  const { offsetWidth: w, offsetHeight: h } = textarea;
  if (w > 0 && h > 0) {
    wrapper.style.width = preview.style.width = `${w}px`;
    wrapper.style.height = preview.style.height = `${h}px`;
  }
}

// ---- Attach connection-dot events (shared by nodes & groups) ----
/**
 * Wires up the four .node-connect-dot elements inside `container`
 * so that dragging from any dot starts a connection line.
 * Called by both attachEditorEvents (nodes) and attachGroupEvents (groups).
 */
export function attachDotEvents(container: HTMLElement): void {
  container.querySelectorAll<HTMLElement>('.node-connect-dot').forEach(dot => {
    dot.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      startConnectDrag(container, e as MouseEvent, dot.dataset['dir'] as Direction);
    });
  });
}

// ---- Attach all events to a freshly created node ----------
export function attachEditorEvents(container: HTMLElement): void {
  container.id = crypto.randomUUID();

  const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
  const preview = container.querySelector<HTMLDivElement>('.tex-preview')!;
  const deleteBtn = container.querySelector<HTMLButtonElement>('.node-delete')!;
  const titleInput = container.querySelector<HTMLInputElement>('.node-title')!;

  textarea.addEventListener('focus', () => container.classList.add('editing'));
  textarea.addEventListener('blur', () => {
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

  // Prevent title drag from bubbling to the node-drag handler.
  titleInput.addEventListener('mousedown', e => e.stopPropagation());

  // Wire the four connection dots.
  attachDotEvents(container);

  renderMath(container);
}

// ---- Begin a preview connection line ----------------------
function startConnectDrag(
  container: HTMLElement,
  e: MouseEvent,
  dir: Direction,
): void {
  drag.active = true;
  drag.sourceNode = container;
  drag.sourceDir = dir;
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

// ---- Selector that matches any connectable container ------
// Both .draggable-container (nodes) and .group-container (groups) can
// be connection endpoints once they carry .node-connect-dot children.
const CONNECTABLE = '.draggable-container, .group-container';

// ---- Global mousemove (called from main.ts) ---------------
export function onMouseMove(e: MouseEvent): void {
  if (!drag.active || !drag.line || !drag.sourceNode || !drag.sourceDir) return;

  const start = getDotPoint(drag.sourceNode, drag.sourceDir);
  updateLinePath(drag.line, start.x, start.y,
    e.clientX + window.scrollX, e.clientY + window.scrollY,
    drag.sourceDir, null);

  clearHovers();
  const targetDot = (e.target as Element).closest<HTMLElement>('.node-connect-dot');
  // Check both node and group containers as valid hover targets.
  const targetCont = (e.target as Element).closest<HTMLElement>(CONNECTABLE);

  if (targetDot) {
    const dotOwner = targetDot.closest<HTMLElement>(CONNECTABLE);
    if (dotOwner && dotOwner !== drag.sourceNode) {
      targetDot.classList.add('dot-target-hover');
    }
  } else if (targetCont && targetCont !== drag.sourceNode) {
    targetCont.classList.add('connect-target-hover');
  }
}

// ---- Global mouseup (called from main.ts) -----------------
export function onMouseUp(e: MouseEvent): boolean {
  if (!drag.active || !drag.sourceNode) return false;

  const targetDot = (e.target as Element).closest<HTMLElement>('.node-connect-dot');
  // Resolve the container whether the user released on a dot or the body.
  const targetCont = targetDot
    ? targetDot.closest<HTMLElement>(CONNECTABLE)
    : (e.target as Element).closest<HTMLElement>(CONNECTABLE);

  if (targetCont && targetCont !== drag.sourceNode) {
    finalizeConnection(drag.sourceNode, targetCont);
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
    opacity: '0',
    transform: 'scale(0.9)',
  });
  setTimeout(() => container.remove(), 200);
  showToast('Node deleted');
}