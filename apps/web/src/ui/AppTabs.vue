<script setup lang="ts">
defineProps<{ items: { key: string; label: string }[]; label: string }>();
const active = defineModel<string>({ required: true });
</script>

<template>
  <!-- One line that scrolls sideways when the tabs do not fit, never a second row. On a phone the row runs to the
       screen edges (the cut-off tab shows that it scrolls) and the first tab starts on the page gutter. -->
  <div
    role="tablist"
    :aria-label="label"
    class="tabs tabs-border -mx-4 flex-nowrap scroll-px-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:scroll-px-0 md:px-0"
  >
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      role="tab"
      class="tab min-h-11 shrink-0 whitespace-nowrap"
      :class="{ 'tab-active': active === item.key }"
      :aria-selected="active === item.key"
      @click="active = item.key"
    >
      {{ item.label }}
    </button>
  </div>
</template>
