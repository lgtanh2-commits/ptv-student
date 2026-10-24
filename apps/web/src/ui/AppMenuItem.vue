<script setup lang="ts">
import { inject } from "vue";
import { menuCloseKey, menuInlineKey } from "./menu";

// One action in an AppMenu, or a plain button inside AppMenuInline. `danger` for actions that remove or archive
// something.
defineProps<{ danger?: boolean }>();
const emit = defineEmits<{ click: [] }>();
const close = inject(menuCloseKey, () => {});
const inline = inject(menuInlineKey, false);
function choose() {
  close();
  emit("click");
}
</script>

<template>
  <button
    v-if="inline"
    type="button"
    class="btn btn-ghost min-h-11 gap-2 font-medium whitespace-nowrap"
    :class="{ 'text-error': danger }"
    @click="emit('click')"
  >
    <slot />
  </button>
  <li v-else role="none">
    <button
      type="button"
      role="menuitem"
      tabindex="-1"
      class="min-h-11 gap-2 whitespace-nowrap"
      :class="{ 'text-error': danger }"
      @click="choose"
    >
      <slot />
    </button>
  </li>
</template>
