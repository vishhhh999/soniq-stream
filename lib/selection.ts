// Standard file-manager selection semantics: plain click replaces the
// selection with just this item; shift-click selects the range between the
// last-clicked item and this one; ctrl/cmd-click toggles this item in/out
// of the selection without touching the rest.
export function computeSelection(
  clickedId: string,
  orderedIds: string[],
  current: Set<string>,
  lastSelectedId: string | null,
  event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }
): { next: Set<string>; newLastSelected: string } {
  if (event.shiftKey && lastSelectedId) {
    const lastIdx = orderedIds.indexOf(lastSelectedId);
    const clickedIdx = orderedIds.indexOf(clickedId);
    if (lastIdx !== -1 && clickedIdx !== -1) {
      const [start, end] = lastIdx < clickedIdx ? [lastIdx, clickedIdx] : [clickedIdx, lastIdx];
      const range = orderedIds.slice(start, end + 1);
      return { next: new Set(range), newLastSelected: clickedId };
    }
  }

  if (event.ctrlKey || event.metaKey) {
    const next = new Set(current);
    if (next.has(clickedId)) next.delete(clickedId);
    else next.add(clickedId);
    return { next, newLastSelected: clickedId };
  }

  return { next: new Set([clickedId]), newLastSelected: clickedId };
}
