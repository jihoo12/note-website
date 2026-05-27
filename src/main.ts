// ============================================================
// TeX Board — main.ts
// Entry point: toolbar, keyboard shortcuts, init.
// ============================================================

import './style.css';
import './nodeDrag';                           // side-effect: registers drag handlers
import { showToast }          from './toast';
import { clearAllConnections, updateAllConnections } from './connections';
import { attachEditorEvents, onMouseMove, onMouseUp } from './node';
import { initViewport, zoomBy, resetView, screenToCanvas } from './viewport';

// ---- DOM refs -----------------------------------------------
const workspace   = document.getElementById('workspace')      as HTMLDivElement;
const canvasLayer = document.getElementById('canvas-layer')   as HTMLDivElement;
const addBtn      = document.getElementById('addTextareaBtn') as HTMLButtonElement;
const connectBtn  = document.getElementById('toggleLineBtn')  as HTMLButtonElement;
const connectLbl  = document.getElementById('connectLabel')   as HTMLSpanElement;
const clearBtn    = document.getElementById('clearLinesBtn')  as HTMLButtonElement;
const statusHint  = document.getElementById('statusHint')     as HTMLDivElement;
const zoomInBtn   = document.getElementById('zoomInBtn')      as HTMLButtonElement;
const zoomOutBtn  = document.getElementById('zoomOutBtn')     as HTMLButtonElement;
const zoomLabel   = document.getElementById('zoomLevel')      as HTMLSpanElement;
const resetBtn    = document.getElementById('resetViewBtn')   as HTMLButtonElement;

// ---- State --------------------------------------------------
let nodeCounter = 3;   // Node A = 1, Node B = 2 are pre-seeded in HTML
let connectMode = false;

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
// Clicking the zoom percentage display also resets the view.
zoomLabel.addEventListener('click',  resetView);

// ---- Clear connections -------------------------------------
clearBtn.addEventListener('click', () => {
  clearAllConnections();
  showToast('All connections cleared');
});

// ---- Add node ----------------------------------------------
addBtn.addEventListener('click', addNode);

function addNode(): void {
  const container     = document.createElement('div');
  container.className = 'draggable-container';

  // Place near the current viewport centre in canvas-local coordinates
  // so the new node is always visible regardless of pan/zoom.
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

// ---- Global pointer events (connection drawing) ------------
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mouseup',   (e: MouseEvent) => {
  const handled = onMouseUp(e);
  if (handled && connectMode) exitConnectMode();
});

// ---- Keyboard shortcuts ------------------------------------
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT') return;

  if (e.key === 'n' || e.key === 'N')   addBtn.click();
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

/** Converts a 1-based counter to a spreadsheet-style label: 1→A, 27→AA … */
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

// Suppress unused-variable warning — kept for potential future use.
void workspace;