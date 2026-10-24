<script setup lang="ts">
import { onBeforeUnmount, provide, ref, watch } from "vue";
import { useMenu } from "@/features/navigation/menu";
import AppIcon from "./AppIcon.vue";
import { menuCloseKey } from "./menu";

// A "⋯" button that opens a short list of rarer actions (archive, delete). The items are AppMenuItem.
// Keyboard: Enter or Space opens it, the arrow keys move, Escape closes it and the focus goes back to the button.
// `compact`: a small ghost trigger for a list row (44px touch target on a phone).
defineProps<{ label: string; compact?: boolean }>();
const root = ref<HTMLElement>();
const button = ref<HTMLButtonElement>();
const list = ref<HTMLElement>();
const items = () => [...(list.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
const menu = useMenu(() => button.value, items);
const open = menu.open;
provide(menuCloseKey, () => menu.close());

// A tap or click outside closes it.
function outside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) menu.close(false);
}
watch(open, (value) => {
  if (value) document.addEventListener("pointerdown", outside);
  else document.removeEventListener("pointerdown", outside);
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
</script>

<template>
  <div ref="root" class="relative shrink-0">
    <button
      ref="button"
      type="button"
      class="btn btn-square"
      :class="
        compact ? 'btn-ghost btn-sm max-sm:size-11' : 'min-h-11 border-base-300 bg-base-100 hover:bg-base-200'
      "
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="menu.toggle()"
      @keydown="menu.onTriggerKey"
    >
      <AppIcon name="more" :size="compact ? 16 : 20" />
    </button>
    <ul
      v-if="open"
      ref="list"
      role="menu"
      :aria-label="label"
      class="menu absolute end-0 top-full z-30 mt-1 w-max max-w-[calc(100vw-2rem)] min-w-48 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg"
      @keydown="menu.onMenuKey($event, $event.target as HTMLElement)"
    >
      <slot />
    </ul>
  </div>
</template>
