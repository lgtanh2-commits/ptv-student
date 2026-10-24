import type { InjectionKey } from "vue";

/** AppMenu gives its items a way to close it once one is chosen. */
export const menuCloseKey: InjectionKey<() => void> = Symbol("menu-close");
