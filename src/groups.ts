// ============================================================
// TeX Board — groups.ts
// Flat-DOM group membership.  Nodes always stay in canvas-layer;
// groups are a visual background rectangle with logical ownership.
// ============================================================

/** Maps every member node to the group it belongs to. */
const _membership = new Map<HTMLElement, HTMLElement>();

/** Add a node to a group (replaces any prior membership). */
export function joinGroup(node: HTMLElement, group: HTMLElement): void {
  _membership.set(node, group);
  node.dataset['groupId'] = group.id;
}

/** Remove a node from whichever group it belongs to. */
export function leaveGroup(node: HTMLElement): void {
  _membership.delete(node);
  delete node.dataset['groupId'];
}

/** Return every node currently belonging to the given group. */
export function getGroupMembers(group: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  _membership.forEach((g, n) => { if (g === group) out.push(n); });
  return out;
}

/** Call when a node is deleted so its membership entry is cleared. */
export function onNodeDeleted(node: HTMLElement): void {
  _membership.delete(node);
}

/** Call when a group is deleted — un-groups every member node. */
export function onGroupDeleted(group: HTMLElement): void {
  const victims: HTMLElement[] = [];
  _membership.forEach((g, n) => { if (g === group) victims.push(n); });
  victims.forEach(n => {
    _membership.delete(n);
    delete n.dataset['groupId'];
  });
}