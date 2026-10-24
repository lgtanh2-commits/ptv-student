import { nextTick, ref } from "vue";

/** Something that can take the keyboard focus (a button, a menu item). */
export interface Focusable {
  focus(): void;
}

/**
 * A small menu that opens from a button (the "⋯" of a page header).
 * Enter or Space on the button opens it (a button turns them into a click) and puts the focus on the first item;
 * the arrow keys move between items; Escape closes it and gives the focus back to the button.
 * Choosing an item also closes it and gives the focus back. Tab or a click elsewhere closes it and leaves the focus where it goes.
 */
export function useMenu(trigger: () => Focusable | undefined, items: () => Focusable[]) {
  const open = ref(false);

  async function focusItem(index: number) {
    await nextTick(); // the items exist only once the menu is shown
    const list = items();
    if (list.length === 0) return;
    list[(index + list.length) % list.length]!.focus();
  }

  function show(index = 0) {
    open.value = true;
    void focusItem(index);
  }

  function close(returnFocus = true) {
    if (!open.value) return;
    open.value = false;
    if (returnFocus) trigger()?.focus();
  }

  function toggle() {
    if (open.value) close();
    else show();
  }

  /** Keys pressed on the button. */
  function onTriggerKey(event: { key: string; preventDefault(): void }) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      show(event.key === "ArrowDown" ? 0 : -1);
    } else if (event.key === "Escape") close();
  }

  /** Keys pressed inside the open menu. `current` is the item that has the focus. */
  function onMenuKey(event: { key: string; preventDefault(): void }, current: Focusable | null) {
    const index = current ? items().indexOf(current) : -1;
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: -1,
    };
    if (event.key in moves) {
      event.preventDefault();
      void focusItem(moves[event.key]!);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") close(false);
  }

  return { open, show, close, toggle, onTriggerKey, onMenuKey };
}
