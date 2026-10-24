<script setup lang="ts">
// The buttons at the end of a form or a card. In the markup the secondary button (Cancel, Back) comes first and the
// main one last. On a phone each button takes a full line, the main one on top (next to the last field) and the
// secondary under it. On a wide screen they form a row on the right, the main one at the far right, each label on one
// line. A full-width button never lets its label stick out: on a very narrow screen the label wraps inside the button,
// which grows taller. `align="start"` puts the wide-screen row on the left. `stack` keeps the phone layout on every
// screen (for a narrow side column).
const props = defineProps<{ align?: "end" | "start"; stack?: boolean }>();
// Full-width buttons: the label may wrap (centred, balanced) and the button grows with it.
const full =
  "[&>.btn]:h-auto [&>.btn]:py-2 [&>.btn]:leading-snug [&>.btn]:whitespace-normal [&>.btn]:text-balance";
const fullOnPhone =
  "max-sm:[&>.btn]:h-auto max-sm:[&>.btn]:py-2 max-sm:[&>.btn]:leading-snug max-sm:[&>.btn]:whitespace-normal max-sm:[&>.btn]:text-balance";
const row = "sm:flex-row sm:flex-wrap sm:items-center sm:*:w-auto sm:[&>.btn]:whitespace-nowrap";
</script>

<template>
  <div
    class="flex flex-col-reverse gap-2 *:w-full"
    :class="props.stack ? full : [fullOnPhone, row, props.align === 'start' ? '' : 'sm:justify-end']"
  >
    <slot />
  </div>
</template>
