// ============================================================
// TeX Board — persistence.ts
// Export the board to JSON and restore it from JSON.
// ============================================================

import type { BoardData, NodeRecord, ConnectionRecord } from './types';
import { connections, clearAllConnections, finalizeConnection } from './connections';
import { attachEditorEvents, renderMath } from './node';

// ---- Export ------------------------------------------------

/**
 * Serialise the current board state to a BoardData object,
 * then trigger a browser download of the JSON file.
 */
export function exportBoard(canvasLayer: HTMLElement): void {
  const nodeEls = canvasLayer.querySelectorAll<HTMLElement>('.draggable-container');

  const nodes: NodeRecord[] = Array.from(nodeEls).map(el => {
    const title   = el.querySelector<HTMLInputElement>('.node-title')!.value;
    const content = el.querySelector<HTMLTextAreaElement>('textarea')!.value;
    const wrapper = el.querySelector<HTMLDivElement>('.editor-wrapper')!;
    return {
      id:      el.id,
      title,
      content,
      x:       parseFloat(el.style.left)         || 0,
      y:       parseFloat(el.style.top)          || 0,
      width:   parseFloat(wrapper.style.width)   || wrapper.offsetWidth,
      height:  parseFloat(wrapper.style.height)  || wrapper.offsetHeight,
    };
  });

  const connRecords: ConnectionRecord[] = connections.map(c => ({
    fromId: c.from.id,
    toId:   c.to.id,
  }));

  const data: BoardData = { version: 1, nodes, connections: connRecords };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `texboard-${timestamp()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Load --------------------------------------------------

/**
 * Tear down the current board and rebuild it from a BoardData snapshot.
 * Returns a plain-English error string on failure, or null on success.
 */
export function loadBoard(
  data: unknown,
  canvasLayer: HTMLElement,
  nodeTemplate: (label: string) => string,
  getNextLabel: () => string,
): string | null {
  // ---- Basic validation ------------------------------------
  if (!data || typeof data !== 'object') return 'File is not a valid JSON object.';
  const d = data as Record<string, unknown>;
  if (d['version'] !== 1)               return 'Unsupported board version.';
  if (!Array.isArray(d['nodes']))        return 'Missing nodes array.';
  if (!Array.isArray(d['connections']))  return 'Missing connections array.';

  const nodeRecords = d['nodes'] as NodeRecord[];
  const connRecords = d['connections'] as ConnectionRecord[];

  // ---- Clear current board ---------------------------------
  clearAllConnections();
  canvasLayer.querySelectorAll('.draggable-container').forEach(el => el.remove());

  // ---- Rebuild nodes ---------------------------------------
  const idMap = new Map<string, HTMLElement>();

  for (const rec of nodeRecords) {
    const container     = document.createElement('div');
    container.className = 'draggable-container';
    container.style.left = `${rec.x}px`;
    container.style.top  = `${rec.y}px`;

    container.innerHTML = nodeTemplate(getNextLabel());
    canvasLayer.appendChild(container);

    container.querySelector<HTMLInputElement>('.node-title')!.value    = rec.title;
    container.querySelector<HTMLTextAreaElement>('textarea')!.value    = rec.content;

    if (rec.width > 0 && rec.height > 0) {
      const wrapper  = container.querySelector<HTMLDivElement>('.editor-wrapper')!;
      const preview  = container.querySelector<HTMLDivElement>('.tex-preview')!;
      const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
      wrapper.style.width   = preview.style.width   = textarea.style.width  = `${rec.width}px`;
      wrapper.style.height  = preview.style.height  = textarea.style.height = `${rec.height}px`;
    }

    attachEditorEvents(container);
    container.id = rec.id;
    idMap.set(rec.id, container);

    renderMath(container);
  }

  // ---- Re-wire connections ---------------------------------
  for (const rec of connRecords) {
    const from = idMap.get(rec.fromId);
    const to   = idMap.get(rec.toId);
    if (from && to) finalizeConnection(from, to);
  }

  return null;
}

// ---- Helpers -----------------------------------------------
// ISO string slice gives "YYYY-MM-DDTHH:MM" → replace separators → "YYYY-MM-DD-HHMM"
const timestamp = (): string =>
  new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '').replace(':', '');