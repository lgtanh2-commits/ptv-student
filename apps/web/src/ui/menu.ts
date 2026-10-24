import type { InjectionKey } from "vue";

/** AppMenu gives its items a way to close it once one is chosen. */
export const menuCloseKey: InjectionKey<() => void> = Symbol("menu-close");

/** Inside AppMenuInline, items show as plain buttons instead of menu entries (when there is room for them). */
export const menuInlineKey: InjectionKey<boolean> = Symbol("menu-inline");
