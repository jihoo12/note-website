// ============================================================
// TeX Board — viewport.ts
// Infinite canvas: pan (middle-drag, space+drag, ctrl+drag)
// and zoom (ctrl+scroll, +/- buttons).
// ============================================================

import { updateAllConnections } from './connections';

// ---- Constants ---------------------------------------------
const MIN_SCALE  = 0.12;
const MAX_SCALE  = 5.0;
const ZOOM_STEP  = 1.18;   // per scroll tick or button press

// ---- Internal state ----------------------------------------
let _panX  = 0;
let _panY  = 0;
let _scale = 1;

let _canvasEl:    HTMLElement;
let _zoomLabelEl: HTMLElement | null = null;

// ---- Pan gesture state -------------------------------------
let _panning   = false;
let _spaceHeld = false;
let _ctrlHeld  = false;
const _anchor  = { mx: 0, my: 0, sx: 0, sy: 0 };

// ---- Init --------------------------------------------------
export function initViewport(canvas: HTMLElement, zoomLabel?: HTMLElement): void {
  _canvasEl    = canvas;
  _zoomLabelEl = zoomLabel ?? null;
  _applyTransform();

  document.addEventListener('wheel',     _onWheel,     { passive: false });
  document.addEventListener('keydown',   _onKeyDown);
  document.addEventListener('keyup',     _onKeyUp);
  document.addEventListener('mousedown', _onPanStart);
  document.addEventListener('mousemove', _onPanMove);
  document.addEventListener('mouseup',   _onPanEnd);
}

// ---- Public API --------------------------------------------

/** Current zoom scale (1 = 100 %). */
export function getScale(): number { return _scale; }

/** True while a pan gesture is active. */
export function isPanningNow(): boolean { return _panning; }

/** True while the spacebar is held. */
export function isSpaceHeld(): boolean { return _spaceHeld; }

/** True while Ctrl is held. */
export function isCtrlHeld(): boolean { return _ctrlHeld; }

/**
 * Convert a screen-space point to canvas-local coordinates.
 * Use this when placing new nodes so they appear at the cursor/center.
 */
export function screenToCanvas(sx: number, sy: number): { x: number; y: number } {
  return {
    x: (sx - _panX) / _scale,
    y: (sy - _panY) / _scale,
  };
}

/**
 * Zoom by a multiplicative factor, pivoting around screen point (cx, cy).
 * Defaults to window centre when cx/cy are omitted.
 */
export function zoomBy(
  factor: number,
  cx = window.innerWidth  / 2,
  cy = window.innerHeight / 2,
): void {
  const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, _scale * factor));
  const k    = next / _scale;
  _panX  = cx - k * (cx - _panX);
  _panY  = cy - k * (cy - _panY);
  _scale = next;
  _applyTransform();
  updateAllConnections();
}

/** Snap back to 100 % zoom at the origin. */
export function resetView(): void {
  _panX = 0; _panY = 0; _scale = 1;
  _applyTransform();
  updateAllConnections();
}

// ---- Internal helpers --------------------------------------

function _applyTransform(): void {
  _canvasEl.style.transform = `translate(${_panX}px,${_panY}px) scale(${_scale})`;
  if (_zoomLabelEl) _zoomLabelEl.textContent = `${Math.round(_scale * 100)}%`;
}

// ---- Wheel zoom (Ctrl+Scroll only) -------------------------
function _onWheel(e: WheelEvent): void {
  // Only zoom when Ctrl is held; free scroll is left to the browser.
  if (!e.ctrlKey) return;
  // Prevent browser's native pinch-zoom / page zoom on Ctrl+Scroll.
  e.preventDefault();
  // Let the browser scroll textareas normally when Ctrl is NOT held
  // (that case already returned above, so this guard is belt-and-braces).
  if ((e.target as Element).closest('textarea')) return;
  zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX, e.clientY);
}

// ---- Spacebar "pan-ready" cursor ---------------------------
function _onKeyDown(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement).tagName;

  if (e.code === 'Space') {
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    e.preventDefault();
    if (_spaceHeld) return;
    _spaceHeld = true;
    document.body.classList.add('pan-ready');
    return;
  }

  if (e.key === 'Control') {
    if (_ctrlHeld) return;
    _ctrlHeld = true;
    // Only show the pan-ready cursor when Ctrl is held outside text fields,
    // so users can still Ctrl+A / Ctrl+C inside textareas normally.
    if (tag !== 'TEXTAREA' && tag !== 'INPUT') {
      document.body.classList.add('pan-ready');
    }
  }
}

function _onKeyUp(e: KeyboardEvent): void {
  if (e.code === 'Space') {
    _spaceHeld = false;
    if (!_ctrlHeld) document.body.classList.remove('pan-ready');
    return;
  }

  if (e.key === 'Control') {
    _ctrlHeld = false;
    if (!_spaceHeld) document.body.classList.remove('pan-ready');
    // If a pan was in progress via Ctrl+drag, end it cleanly.
    if (_panning) {
      _panning = false;
      document.body.classList.remove('panning');
    }
  }
}

// ---- Pan gesture -------------------------------------------
function _onPanStart(e: MouseEvent): void {
  const t      = e.target as Element;
  const onNode = !!t.closest('.draggable-container');
  const onUI   = !!t.closest('.toolbar, .toast');
  const onDot  = !!t.closest('.node-connect-dot');

  // Three ways to initiate a pan:
  const middleBtn = e.button === 1;                        // middle-click anywhere
  const spaceLMB  = e.button === 0 && _spaceHeld;         // Space + left-drag
  const ctrlLMB   = e.button === 0 && _ctrlHeld && !onUI && !onDot; // Ctrl + left-drag

  if (onUI || onDot) return;
  if (!middleBtn && !spaceLMB && !ctrlLMB) return;

  _panning    = true;
  _anchor.mx  = e.clientX;
  _anchor.my  = e.clientY;
  _anchor.sx  = _panX;
  _anchor.sy  = _panY;
  document.body.classList.add('panning');
  e.preventDefault();
}

function _onPanMove(e: MouseEvent): void {
  if (!_panning) return;
  _panX = _anchor.sx + (e.clientX - _anchor.mx);
  _panY = _anchor.sy + (e.clientY - _anchor.my);
  _applyTransform();
  updateAllConnections();
}

function _onPanEnd(): void {
  if (!_panning) return;
  _panning = false;
  document.body.classList.remove('panning');
}