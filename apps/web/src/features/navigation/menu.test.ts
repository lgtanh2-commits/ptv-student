import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useMenu, type Focusable } from "./menu";

function setup(count = 3) {
  const focused: string[] = [];
  const el = (name: string): Focusable => ({ focus: () => focused.push(name) });
  const trigger = el("trigger");
  const items = Array.from({ length: count }, (_, i) => el(`item${i}`));
  const menu = useMenu(
    () => trigger,
    () => (menu.open.value ? items : []),
  );
  const key = (k: string) => ({ key: k, preventDefault: vi.fn() });
  return { menu, items, focused, key };
}

describe("useMenu", () => {
  it("opens from the button (Enter or Space make a click) and puts the focus on the first item", async () => {
    const { menu, focused } = setup();
    menu.toggle();
    expect(menu.open.value).toBe(true);
    await nextTick();
    expect(focused).toEqual(["item0"]);
  });

  it("Escape closes it and gives the focus back to the button", async () => {
    const { menu, items, focused, key } = setup();
    menu.toggle();
    await nextTick();
    const esc = key("Escape");
    menu.onMenuKey(esc, items[0]!);
    expect(menu.open.value).toBe(false);
    expect(esc.preventDefault).toHaveBeenCalled();
    expect(focused.at(-1)).toBe("trigger");
  });

  it("the arrow keys move between items and wrap around; Home and End go to the ends", async () => {
    const { menu, items, focused, key } = setup();
    menu.show();
    await nextTick();
    menu.onMenuKey(key("ArrowDown"), items[0]!);
    await nextTick();
    menu.onMenuKey(key("ArrowDown"), items[2]!);
    await nextTick();
    menu.onMenuKey(key("ArrowUp"), items[0]!);
    await nextTick();
    menu.onMenuKey(key("Home"), items[2]!);
    await nextTick();
    menu.onMenuKey(key("End"), items[0]!);
    await nextTick();
    expect(focused).toEqual(["item0", "item1", "item0", "item2", "item0", "item2"]);
  });

  it("ArrowDown or ArrowUp on the button opens it at the first or the last item", async () => {
    const { menu, focused, key } = setup();
    menu.onTriggerKey(key("ArrowUp"));
    await nextTick();
    expect(menu.open.value).toBe(true);
    expect(focused).toEqual(["item2"]);
  });

  it("Tab closes it without taking the focus back; choosing an item closes it and gives the focus back", async () => {
    const { menu, items, focused, key } = setup();
    menu.show();
    await nextTick();
    menu.onMenuKey(key("Tab"), items[0]!);
    expect(menu.open.value).toBe(false);
    expect(focused).toEqual(["item0"]);
    menu.show();
    menu.close();
    expect(focused.at(-1)).toBe("trigger");
  });

  it("closing a closed menu does nothing", () => {
    const { menu, focused } = setup();
    menu.close();
    expect(focused).toEqual([]);
  });
});
