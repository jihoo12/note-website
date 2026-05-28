// ============================================================
// TeX Board — main.ts
// Entry point: toolbar, keyboard shortcuts, init.
// ============================================================

import './style.css';
import './nodeDrag';                           // side-effect: registers drag handlers
import { showToast }          from './toast';
import {
  clearAllConnections,
  updateAllConnections,
  removeConnectionsForNode,
  markConnectionsDirty,
  scheduleConnectionUpdate,
} from './connections';
import { attachEditorEvents, attachDotEvents, onMouseMove, onMouseUp } from './node';
import { initViewport, zoomBy, resetView, screenToCanvas, getScale } from './viewport';
import { exportBoard, loadBoard } from './persistence';
import { onGroupDeleted }     from './groups';

// ---- DOM refs -----------------------------------------------
const workspace   = document.getElementById('workspace')      as HTMLDivElement;
const canvasLayer = document.getElementById('canvas-layer')   as HTMLDivElement;
const addBtn      = document.getElementById('addTextareaBtn') as HTMLButtonElement;
const addGroupBtn = document.getElementById('addGroupBtn')    as HTMLButtonElement;
const connectBtn  = document.getElementById('toggleLineBtn')  as HTMLButtonElement;
const connectLbl  = document.getElementById('connectLabel')   as HTMLSpanElement;
const clearBtn    = document.getElementById('clearLinesBtn')  as HTMLButtonElement;
const statusHint  = document.getElementById('statusHint')     as HTMLDivElement;
const zoomInBtn   = document.getElementById('zoomInBtn')      as HTMLButtonElement;
const zoomOutBtn  = document.getElementById('zoomOutBtn')     as HTMLButtonElement;
const zoomLabel   = document.getElementById('zoomLevel')      as HTMLSpanElement;
const resetBtn    = document.getElementById('resetViewBtn')   as HTMLButtonElement;
const exportBtn   = document.getElementById('exportBtn')      as HTMLButtonElement;
const loadBtn     = document.getElementById('loadBtn')        as HTMLButtonElement;
const fileInput   = document.getElementById('fileInput')      as HTMLInputElement;

// ---- State --------------------------------------------------
let nodeCounter  = 3;   // Node A = 1, Node B = 2 are pre-seeded in HTML
let groupCounter = 1;
let connectMode  = false;

// ---- Init viewport (infinite canvas pan/zoom) --------------
initViewport(canvasLayer, zoomLabel);

// ---- Init default nodes ------------------------------------
document.querySelectorAll<HTMLElement>('.draggable-container').forEach(attachEditorEvents);

// ---- Connect mode toggle -----------------------------------
connectBtn.addEventListener('click', () => {
  connectMode = !connectMode;
  applyConnectMode();
});

function applyConnectMode(): void {
  connectLbl.textContent = connectMode ? 'Cancel' : 'Connect';
  connectBtn.classList.toggle('active', connectMode);
  document.body.classList.toggle('drawing-mode', connectMode);
  statusHint.textContent = connectMode
    ? "Click a node\u2019s dot to start \u00B7 Click another to connect"
    : 'Ctrl+Scroll to zoom \u00B7 Ctrl+Drag or Middle-Drag to pan \u00B7 Drag handles to move';
  statusHint.classList.toggle('alert', connectMode);
}

function exitConnectMode(): void {
  connectMode = false;
  applyConnectMode();
}

// ---- Zoom controls -----------------------------------------
zoomInBtn.addEventListener('click',  () => zoomBy(1.2));
zoomOutBtn.addEventListener('click', () => zoomBy(1 / 1.2));
resetBtn.addEventListener('click',   resetView);
zoomLabel.addEventListener('click',  resetView);

// ---- Clear connections -------------------------------------
clearBtn.addEventListener('click', () => {
  clearAllConnections();
  showToast('All connections cleared');
});

// ---- Export ------------------------------------------------
exportBtn.addEventListener('click', () => {
  exportBoard(canvasLayer);
  showToast('Board exported');
});

// ---- Load --------------------------------------------------
loadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  fileInput.value = '';

  const reader = new FileReader();
  reader.onload = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(reader.result as string);
    } catch {
      showToast('Error: invalid JSON file');
      return;
    }

    const err = loadBoard(parsed, canvasLayer, nodeTemplate, () => {
      const label = nodeLabel(nodeCounter++);
      return label;
    });

    if (err) {
      showToast(`Error: ${err}`);
    } else {
      showToast('Board loaded');
    }
  };
  reader.readAsText(file);
});

// ---- Add node ----------------------------------------------
addBtn.addEventListener('click', addNode);

function addNode(): void {
  const container     = document.createElement('div');
  container.className = 'draggable-container';

  const cx = window.innerWidth  / 2 + randomBetween(-110, 110);
  const cy = window.innerHeight / 2 + randomBetween(-60,   60);
  const { x, y } = screenToCanvas(cx, cy);
  container.style.left = `${x}px`;
  container.style.top  = `${y}px`;

  const label = nodeLabel(nodeCounter++);
  container.innerHTML = nodeTemplate(label);

  canvasLayer.appendChild(container);
  container.classList.add('node-enter');
  setTimeout(() => container.classList.remove('node-enter'), 300);

  attachEditorEvents(container);
  setTimeout(() => {
    container.classList.add('editing');
    container.querySelector<HTMLTextAreaElement>('textarea')!.focus();
  }, 50);
}

// ---- Add group ---------------------------------------------
addGroupBtn.addEventListener('click', addGroup);

function addGroup(): void {
  const container     = document.createElement('div');
  container.className = 'group-container';

  const cx = window.innerWidth  / 2 + randomBetween(-100, 100);
  const cy = window.innerHeight / 2 + randomBetween(-60,   60);
  const { x, y } = screenToCanvas(cx, cy);
  container.style.left   = `${x - 240}px`;
  container.style.top    = `${y - 160}px`;
  container.style.width  = '480px';
  container.style.height = '320px';

  const label = nodeLabel(groupCounter++);
  container.innerHTML = groupTemplate(label);

  canvasLayer.appendChild(container);
  attachGroupEvents(container);

  container.classList.add('group-enter');
  setTimeout(() => container.classList.remove('group-enter'), 300);

  showToast('Group created — drag nodes into it');
}

// ---- Attach all events to a freshly created group ----------
function attachGroupEvents(container: HTMLElement): void {
  container.id = crypto.randomUUID();

  const titleInput    = container.querySelector<HTMLInputElement>('.group-title')!;
  const deleteBtn     = container.querySelector<HTMLButtonElement>('.group-delete')!;
  const resizeHandle  = container.querySelector<HTMLElement>('.group-resize-handle')!;

  // Prevent title clicks from bubbling to the drag handler.
  titleInput.addEventListener('mousedown', e => e.stopPropagation());

  // ── Delete ──────────────────────────────────────────────
  deleteBtn.addEventListener('click', e => {
    e.stopPropagation();
    onGroupDeleted(container);           // clear group membership map
    removeConnectionsForNode(container); // remove all connections to/from the group
    Object.assign(container.style, {
      transition: 'opacity 0.2s, transform 0.2s',
      opacity:    '0',
      transform:  'scale(0.96)',
    });
    setTimeout(() => container.remove(), 200);
    showToast('Group deleted');
  });

  // ── Connection dots ──────────────────────────────────────
  // Reuse the same dot-wiring helper used by nodes.
  attachDotEvents(container);

  // ── Resize handle ────────────────────────────────────────
  // Native CSS resize (resize:both) requires overflow:hidden, which clips the
  // connection dots that sit -7px outside the border.  Instead we use a tiny
  // custom handle in the bottom-right corner and implement resize in JS.
  let resizing   = false;
  let startX = 0, startY = 0, startW = 0, startH = 0;

  resizeHandle.addEventListener('mousedown', e => {
    e.stopPropagation();   // don't trigger node/group drag
    e.preventDefault();
    resizing = true;
    startX   = e.clientX;
    startY   = e.clientY;
    startW   = container.offsetWidth;
    startH   = container.offsetHeight;
    document.body.style.cursor = 'se-resize';
  });

  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const s  = getScale();
    const dW = (e.clientX - startX) / s;
    const dH = (e.clientY - startY) / s;
    container.style.width  = `${Math.max(300, startW + dW)}px`;
    container.style.height = `${Math.max(180, startH + dH)}px`;
    // Dot positions change with size — mark all connections dirty.
    markConnectionsDirty(container);
    scheduleConnectionUpdate();
  });

  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    document.body.style.cursor = '';
  });
}

// ---- Global pointer events (connection drawing) ------------
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mouseup',   (e: MouseEvent) => {
  const handled = onMouseUp(e);
  if (handled && connectMode) exitConnectMode();
});

// ---- Keyboard shortcuts ------------------------------------
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement).tagName;

  // Ctrl+S — export
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    exportBtn.click();
    return;
  }

  if (tag === 'TEXTAREA' || tag === 'INPUT') return;

  if (e.key === 'n' || e.key === 'N')   addBtn.click();
  if (e.key === 'g' || e.key === 'G')   addGroupBtn.click();
  if (e.key === 'c' || e.key === 'C')   connectBtn.click();
  if (e.key === 'Escape')               exitConnectMode();
  if (e.key === '=' || e.key === '+')   zoomBy(1.2);
  if (e.key === '-')                    zoomBy(1 / 1.2);
  if (e.key === 'r' || e.key === 'R')   resetView();
});

// ---- Resize ------------------------------------------------
window.addEventListener('resize', updateAllConnections);

// ---- Helpers -----------------------------------------------
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

function nodeLabel(n: number): string {
  let label = '';
  let num   = n;
  while (num > 0) {
    num--;
    label = String.fromCharCode(65 + (num % 26)) + label;
    num   = Math.floor(num / 26);
  }
  return label;
}

function nodeTemplate(label: string): string {
  return `
    <div class="node-header">
      <div class="drag-handle">
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
          <path d="M0 1h12M0 4h12M0 7h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </div>
      <input class="node-title" type="text" value="Node ${label}" placeholder="Label…" spellcheck="false">
      <button class="node-delete" title="Delete node">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div class="editor-wrapper">
      <textarea placeholder="Type TeX here…"></textarea>
      <div class="tex-preview"></div>
    </div>
    <div class="node-connect-dot" data-dir="top"></div>
    <div class="node-connect-dot" data-dir="right"></div>
    <div class="node-connect-dot" data-dir="bottom"></div>
    <div class="node-connect-dot" data-dir="left"></div>
  `;
}

function groupTemplate(label: string): string {
  return `
    <div class="group-header">
      <div class="drag-handle">
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
          <path d="M0 1h12M0 4h12M0 7h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </div>
      <input class="group-title" type="text" value="Group ${label}" placeholder="Group label…" spellcheck="false">
      <button class="group-delete" title="Delete group">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div class="group-body-hint">Drop nodes here</div>

    <!-- Four connection dots — same as nodes, positioned on each edge -->
    <div class="node-connect-dot" data-dir="top"></div>
    <div class="node-connect-dot" data-dir="right"></div>
    <div class="node-connect-dot" data-dir="bottom"></div>
    <div class="node-connect-dot" data-dir="left"></div>

    <!-- Custom resize handle (bottom-right corner) -->
    <div class="group-resize-handle" title="Resize group">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M9 2L2 9M9 5.5L5.5 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </div>
  `;
}

// Suppress unused-variable warning — kept for potential future use.
void workspace;