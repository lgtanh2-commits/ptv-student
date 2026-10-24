<script setup lang="ts">
import AppIcon, { type IconName } from "./AppIcon.vue";

// The ONLY place that decides how a button looks. Pages use <AppButton>, never raw styles.
withDefaults(
  defineProps<{
    type?: "button" | "submit";
    /** primary: the main action of the page (use once). secondary: the normal button. */
    variant?: "primary" | "secondary" | "danger" | "ghost" | "link";
    disabled?: boolean;
    loading?: boolean;
    /** A smaller button for use inside lists and tables. On a phone it keeps a 44px touch height. */
    compact?: boolean;
    /** Fill the width of its container. */
    block?: boolean;
    /** A square button that shows only this icon (delete or edit in a dense row). Needs `label`. */
    icon?: IconName;
    /** What an icon-only button does, read by screen readers and shown on hover. */
    label?: string;
  }>(),
  { type: "button", variant: "primary" },
);
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :aria-label="icon ? label : undefined"
    :title="icon ? label : undefined"
    class="btn gap-2 font-medium"
    :class="{
      'border-base-300 bg-base-100 hover:bg-base-200': variant === 'secondary',
      'btn-primary': variant === 'primary',
      'btn-error': variant === 'danger',
      'btn-ghost': variant === 'ghost',
      'btn-link': variant === 'link',
      'btn-sm max-sm:min-h-11': compact,
      'min-h-11': !compact /* 44px: easy to touch */,
      'btn-square': icon,
      'max-sm:size-11': icon && compact,
      'size-11': icon && !compact,
      'w-full': block,
    }"
  >
    <span v-if="loading" class="loading loading-spinner loading-sm" aria-hidden="true" />
    <AppIcon v-else-if="icon" :name="icon" :size="compact ? 16 : 18" />
    <slot v-if="!icon" />
  </button>
</template>
