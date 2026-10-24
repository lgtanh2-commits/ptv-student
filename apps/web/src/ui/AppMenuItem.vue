<script setup lang="ts">
import { inject } from "vue";
import { menuCloseKey } from "./menu";

// One action in an AppMenu. `danger` for actions that remove or archive something.
defineProps<{ danger?: boolean }>();
const emit = defineEmits<{ click: [] }>();
const close = inject(menuCloseKey, () => {});
function choose() {
  close();
  emit("click");
}
</script>

<template>
  <li role="none">
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
