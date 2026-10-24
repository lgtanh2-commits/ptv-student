<script setup lang="ts">
import AppIcon, { type IconName } from "./AppIcon.vue";
// "Nothing here yet". The full version (icon, title, text, call to action) is for a page that has nothing to show.
// `compact` is for a card or a tab section: no icon, a small title. On a phone the call to action is full width.
defineProps<{ icon?: IconName; title: string; text?: string; compact?: boolean }>();
</script>

<template>
  <div
    class="flex flex-col items-center text-center"
    :class="compact ? 'gap-1 px-5 py-6' : 'gap-3 px-4 py-10'"
  >
    <span
      v-if="icon && !compact"
      class="grid size-14 place-items-center rounded-full bg-primary/10 text-primary"
    >
      <AppIcon :name="icon" :size="28" />
    </span>
    <h3 :class="compact ? 'text-sm font-medium' : 'text-lg font-semibold'">{{ title }}</h3>
    <p v-if="text" class="max-w-sm text-base-content/60" :class="{ 'text-sm': compact }">{{ text }}</p>
    <div
      v-if="$slots.default"
      class="mt-2 flex w-full max-w-xs flex-col gap-2 *:w-full sm:w-auto sm:max-w-none sm:flex-row sm:justify-center sm:*:w-auto"
    >
      <slot />
    </div>
  </div>
</template>
