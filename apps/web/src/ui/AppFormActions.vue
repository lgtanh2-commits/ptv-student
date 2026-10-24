<script setup lang="ts">
// The buttons at the end of a form or a card. In the markup the secondary button (Cancel, Back) comes first and the
// main one last. On a phone each button takes a full line, the main one on top (next to the last field) and the
// secondary under it. On a wide screen they form a row on the right, the main one at the far right. A label never
// wraps. `align="start"` puts the wide-screen row on the left. `stack` keeps the phone layout on every screen (for a
// narrow side column).
defineProps<{ align?: "end" | "start"; stack?: boolean }>();
</script>

<template>
  <div
    class="flex flex-col-reverse gap-2 *:w-full [&>.btn]:whitespace-nowrap"
    :class="
      stack
        ? ''
        : ['sm:flex-row sm:flex-wrap sm:items-center sm:*:w-auto', align === 'start' ? '' : 'sm:justify-end']
    "
  >
    <slot />
  </div>
</template>
