// ============================================================
// TeX Board — groups.ts
// Flat-DOM group membership.  Nodes always stay in canvas-layer;
// groups are a visual background rectangle with logical ownership.
// ============================================================

/** Maps every member (node or group) to the group it belongs to. */
const _membership = new Map<HTMLElement, HTMLElement>();


/** Add an element (node or group) to a group (replaces any prior membership). */
export function joinGroup(member: HTMLElement, group: HTMLElement): void {
  // Prevent circular nesting.
  if (member === group) return;
  if (isDescendantOf(group, member)) return;

  _membership.set(member, group);
  member.dataset['groupId'] = group.id;
}


/** Remove an element from whichever group it belongs to. */
export function leaveGroup(member: HTMLElement): void {
  _membership.delete(member);
  delete member.dataset['groupId'];
}


/** Return every element currently belonging to the given group. */
export function getGroupMembers(group: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  _membership.forEach((g, m) => { if (g === group) out.push(m); });
  return out;
}

/** Return every element currently belonging to the given group, recursively. */
export function getGroupMembersRecursive(group: HTMLElement): HTMLElement[] {
  let out: HTMLElement[] = [];
  const directs = getGroupMembers(group);
  directs.forEach(m => {
    out.push(m);
    if (m.classList.contains('group-container')) {
      out = out.concat(getGroupMembersRecursive(m));
    }
  });
  return out;
}


/** 
 * Returns TRUE if `child` is inside `parent` group, 
 * or inside a subgroup of `parent`, etc.
 */
export function isDescendantOf(child: HTMLElement, parent: HTMLElement): boolean {
  let curr = _membership.get(child);
  while (curr) {
    if (curr === parent) return true;
    curr = _membership.get(curr);
  }
  return false;
}


/** Call when a node or group is deleted so its membership entry is cleared. */
export function onNodeDeleted(member: HTMLElement): void {
  _membership.delete(member);
}


/** Call when a group is deleted — un-groups every member element. */
export function onGroupDeleted(group: HTMLElement): void {
  // If the group itself was a member of another group, clear that first.
  _membership.delete(group);

  const directMembers: HTMLElement[] = [];
  _membership.forEach((g, m) => { if (g === group) directMembers.push(m); });
  directMembers.forEach(m => {
    _membership.delete(m);
    delete m.dataset['groupId'];
  });
}


/**
 * Wipe the entire membership map.
 * Called by loadBoard before rebuilding the canvas from a JSON snapshot,
 * after all existing DOM elements have been removed.
 */
export function clearAllGroups(): void {
  _membership.clear();
}