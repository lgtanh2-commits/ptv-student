<script setup lang="ts">
// A bar stuck to the bottom of the screen while a long page scrolls, with one main button (save the attendance, hand
// in the work). On a phone the status line (the `status` slot) sits on a small line above a full-width button; from
// `sm` up the status is on the left and the button on the right. The bottom padding keeps the button clear of the
// home indicator of phones without a home button.
</script>

<template>
  <div
    data-action-bar
    class="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-base-300 bg-base-100/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur max-sm:[&>.btn]:w-full sm:flex-row sm:items-center sm:justify-between sm:gap-3 md:mx-0 md:rounded-box md:border"
  >
    <div class="min-w-0 text-sm text-pretty"><slot name="status" /></div>
    <slot />
  </div>
</template>
