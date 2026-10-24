<script setup lang="ts">
withDefaults(defineProps<{ tone?: "neutral" | "success" | "warning" | "error" | "info" }>(), {
  tone: "neutral",
});
</script>

<template>
  <span
    class="badge badge-soft max-w-full whitespace-nowrap"
    :class="{
      'badge-success': tone === 'success',
      'badge-warning': tone === 'warning',
      'badge-error': tone === 'error',
      'badge-info': tone === 'info',
    }"
  >
    <!-- A long label is cut with "…" when its row gives it less room (AppListRow keeps it under about half the row). -->
    <span class="truncate"><slot /></span>
  </span>
</template>
