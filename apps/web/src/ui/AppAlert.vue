<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
// A short message in a coloured box: 1 to 3 lines of text. The icon lines up with the first line, and a long word
// (an address, an email) wraps instead of overflowing. Buttons go in `#actions`: a row of their own under the text,
// at the right, main button last. Never put buttons inside the text.
withDefaults(defineProps<{ kind?: "error" | "success" | "info" | "warning" }>(), { kind: "info" });
</script>

<template>
  <div
    :role="kind === 'error' ? 'alert' : 'status'"
    :data-error-anchor="kind === 'error' ? '' : undefined"
    class="alert alert-soft items-start"
    :class="{
      'alert-error': kind === 'error',
      'alert-success': kind === 'success',
      'alert-info': kind === 'info',
      'alert-warning': kind === 'warning',
    }"
  >
    <AppIcon
      :name="
        kind === 'error' ? 'alert' : kind === 'success' ? 'done' : kind === 'warning' ? 'warning' : 'info'
      "
      :size="18"
      class="mt-px"
    />
    <div class="w-full min-w-0 text-sm text-pretty break-words">
      <slot />
      <div v-if="$slots.actions" class="mt-2 flex flex-wrap items-center justify-end gap-2">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
