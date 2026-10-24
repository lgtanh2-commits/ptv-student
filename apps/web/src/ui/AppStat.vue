<script setup lang="ts">
import AppIcon, { type IconName } from "./AppIcon.vue";
// One number in a tile. Tiles in a group have the same height (h-full): the value never wraps, the label takes at most
// 2 lines. On a phone the tile is compact (smaller padding and icon). Use AppStatGroup to lay tiles out.
defineProps<{
  value: string | number;
  label: string;
  icon: IconName;
  tone?: "primary" | "secondary" | "accent";
  /** From lg the icon sits above the number, so the label has the tile's full width (a row of 5 narrow tiles). */
  stackLg?: boolean;
}>();
</script>

<template>
  <div
    class="flex h-full min-w-0 items-center gap-3 rounded-box border border-base-300 bg-base-100 p-3 sm:gap-4 sm:p-4"
    :class="{ 'lg:flex-col lg:items-start lg:gap-2': stackLg }"
  >
    <span
      class="grid size-9 shrink-0 place-items-center rounded-field sm:size-12 [&>svg]:size-4.5 sm:[&>svg]:size-6"
      :class="{
        'bg-primary/10 text-primary': !tone || tone === 'primary',
        'bg-secondary/15 text-secondary': tone === 'secondary',
        'bg-accent/20 text-accent-content': tone === 'accent',
      }"
    >
      <AppIcon :name="icon" :size="24" />
    </span>
    <div class="min-w-0">
      <p class="text-xl font-semibold leading-tight whitespace-nowrap tabular-nums sm:text-2xl">
        {{ value }}
      </p>
      <p class="line-clamp-2 text-sm leading-snug text-pretty text-base-content/60">{{ label }}</p>
    </div>
  </div>
</template>
