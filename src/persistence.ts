// ============================================================
// TeX Board — persistence.ts
// Export the board to JSON and restore it from JSON.
// Handles nodes, groups, group membership, and connections.
// ============================================================

import type { BoardData, NodeRecord, GroupRecord, ConnectionRecord } from './types';
import { connections, clearAllConnections, finalizeConnection } from './connections';
import { attachEditorEvents } from './node';
import { joinGroup, clearAllGroups } from './groups';

// ---- Callbacks passed in from main.ts ----------------------
// Kept as a plain interface (not exported) — only persistence.ts needs it.
interface LoadCallbacks {
  /** Produce the inner HTML for a new node element. */
  nodeTemplate: (label: string) => string;
  /** Produce the inner HTML for a new group element. */
  groupTemplate: (label: string) => string;
  /** Return the next auto-label for a node (e.g. "C", "D", …). */
  getNextLabel: () => string;
  /** Return the next auto-label for a group (e.g. "A", "B", …). */
  getNextGroupLabel: () => string;
  /** Wire up all interactive behaviour on a freshly created group element. */
  attachGroupEvents: (el: HTMLElement) => void;
}

// ---- Export ------------------------------------------------

/**
 * Serialise the current board state — nodes, groups, membership, connections —
 * to a BoardData JSON file and trigger a browser download.
 */
export function exportBoard(canvasLayer: HTMLElement): void {
  // ── Nodes ──────────────────────────────────────────────────
  const nodeEls = canvasLayer.querySelectorAll<HTMLElement>('.draggable-container');
  const nodes: NodeRecord[] = Array.from(nodeEls).map(el => {
    const title = el.querySelector<HTMLInputElement>('.node-title')!.value;
    const content = el.querySelector<HTMLTextAreaElement>('textarea')!.value;
    const wrapper = el.querySelector<HTMLDivElement>('.editor-wrapper')!;
    return {
      id: el.id,
      title,
      content,
      x: parseFloat(el.style.left) || 0,
      y: parseFloat(el.style.top) || 0,
      width: parseFloat(wrapper.style.width) || wrapper.offsetWidth,
      height: parseFloat(wrapper.style.height) || wrapper.offsetHeight,
      // groupId is set as a data attribute by joinGroup(); undefined when not in a group.
      groupId: el.dataset['groupId'] || undefined,
    };
  });

  // ── Groups ─────────────────────────────────────────────────
  const groupEls = canvasLayer.querySelectorAll<HTMLElement>('.group-container');
  const groups: GroupRecord[] = Array.from(groupEls).map(el => ({
    id: el.id,
    title: el.querySelector<HTMLInputElement>('.group-title')!.value,
    x: parseFloat(el.style.left) || 0,
    y: parseFloat(el.style.top) || 0,
    width: parseFloat(el.style.width) || el.offsetWidth,
    height: parseFloat(el.style.height) || el.offsetHeight,
    // groupId is set as a data attribute by joinGroup(); undefined when not nested.
    groupId: el.dataset['groupId'] || undefined,
  }));


  // ── Connections ────────────────────────────────────────────
  // Connection endpoints may be nodes OR groups — both have .id set.
  const connRecords: ConnectionRecord[] = connections.map(c => ({
    fromId: c.from.id,
    toId: c.to.id,
  }));

  const data: BoardData = { version: 1, nodes, connections: connRecords, groups };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `texboard-${_timestamp()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Load --------------------------------------------------

/**
 * Tear down the current board (nodes, groups, connections, membership)
 * and rebuild it from a BoardData snapshot.
 * Returns a plain-English error string on failure, or null on success.
 */
export function loadBoard(
  data: unknown,
  canvasLayer: HTMLElement,
  callbacks: LoadCallbacks,
): string | null {
  // ── Validate ───────────────────────────────────────────────
  if (!data || typeof data !== 'object') return 'File is not a valid JSON object.';
  const d = data as Record<string, unknown>;
  if (d['version'] !== 1) return 'Unsupported board version.';
  if (!Array.isArray(d['nodes'])) return 'Missing nodes array.';
  if (!Array.isArray(d['connections'])) return 'Missing connections array.';

  const nodeRecords = d['nodes'] as NodeRecord[];
  const connRecords = d['connections'] as ConnectionRecord[];
  // groups is optional for backward compat with pre-group board files.
  const groupRecords = (Array.isArray(d['groups']) ? d['groups'] : []) as GroupRecord[];

  // ── Clear current board ────────────────────────────────────
  clearAllConnections();
  clearAllGroups();   // wipe the membership Map before removing DOM nodes
  canvasLayer.querySelectorAll('.draggable-container, .group-container')
    .forEach(el => el.remove());

  // ── Rebuild groups (before nodes so z-index 1 < z-index 2 works) ──
  // Maps the saved group id → the newly created element.
  // The element gets a fresh randomUUID from attachGroupEvents, but we
  // restore the saved id afterwards so connection records still resolve.
  const groupIdMap = new Map<string, HTMLElement>();

  for (const rec of groupRecords) {
    const container = document.createElement('div');
    container.className = 'group-container';
    container.style.left = `${rec.x}px`;
    container.style.top = `${rec.y}px`;
    container.style.width = `${rec.width}px`;
    container.style.height = `${rec.height}px`;

    container.innerHTML = callbacks.groupTemplate(callbacks.getNextGroupLabel());
    canvasLayer.appendChild(container);

    // Set the title from saved data.
    container.querySelector<HTMLInputElement>('.group-title')!.value = rec.title;

    // Wire up drag, dots, resize, delete — also assigns a fresh UUID to container.id.
    callbacks.attachGroupEvents(container);

    // Restore the saved id so connection fromId/toId lookups work.
    container.id = rec.id;
    groupIdMap.set(rec.id, container);
  }

  // Restore group-in-group membership now that all groups exist.
  for (const rec of groupRecords) {
    if (rec.groupId) {
      const parent = groupIdMap.get(rec.groupId);
      const child = groupIdMap.get(rec.id);
      if (parent && child) joinGroup(child, parent);
    }
  }


  // ── Rebuild nodes ──────────────────────────────────────────
  const nodeIdMap = new Map<string, HTMLElement>();

  for (const rec of nodeRecords) {
    const container = document.createElement('div');
    container.className = 'draggable-container';
    container.style.left = `${rec.x}px`;
    container.style.top = `${rec.y}px`;

    container.innerHTML = callbacks.nodeTemplate(callbacks.getNextLabel());
    canvasLayer.appendChild(container);

    container.querySelector<HTMLInputElement>('.node-title')!.value = rec.title;
    container.querySelector<HTMLTextAreaElement>('textarea')!.value = rec.content;

    if (rec.width > 0 && rec.height > 0) {
      const wrapper = container.querySelector<HTMLDivElement>('.editor-wrapper')!;
      const preview = container.querySelector<HTMLDivElement>('.tex-preview')!;
      const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!;
      wrapper.style.width = preview.style.width = textarea.style.width = `${rec.width}px`;
      wrapper.style.height = preview.style.height = textarea.style.height = `${rec.height}px`;
    }

    // attachEditorEvents assigns a fresh UUID, then we restore the saved id.
    attachEditorEvents(container);
    container.id = rec.id;
    nodeIdMap.set(rec.id, container);

    // Restore group membership.
    if (rec.groupId) {
      const group = groupIdMap.get(rec.groupId);
      if (group) joinGroup(container, group);
    }
  }

  // ── Re-wire connections ────────────────────────────────────
  // Endpoints can be nodes OR groups — check both maps.
  const entityMap = new Map<string, HTMLElement>([...groupIdMap, ...nodeIdMap]);
  for (const rec of connRecords) {
    const from = entityMap.get(rec.fromId);
    const to = entityMap.get(rec.toId);
    if (from && to) finalizeConnection(from, to);
  }

  return null;
}

// ---- Helpers -----------------------------------------------
const _timestamp = (): string =>
  new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '').replace(':', '');