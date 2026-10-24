<script setup lang="ts">
import { computed } from "vue";
import AppIcon, { type IconName } from "./AppIcon.vue";
import AppStat from "./AppStat.vue";

export type StatItem = {
  value: string | number;
  label: string;
  icon: IconName;
  tone?: "primary" | "secondary" | "accent";
  /** With `pick`: the tile is a button that sends this id. */
  id?: string;
};

// A group of number tiles.
// count: 2 compact tiles a row on a phone (an odd last tile takes the whole row), every tile in one row from sm (3)
// or lg (4, 5). With `label` the tiles are buttons in a <nav> and clicking one sends `pick` with its id.
// money: amounts do not fit in narrow tiles, so the group is one card of rows (label left, amount right) until the
// group itself is wide enough for a row of tiles.
const props = defineProps<{ items: StatItem[]; kind?: "count" | "money"; label?: string }>();
const emit = defineEmits<{ pick: [id: string] }>();

const n = computed(() => props.items.length);
const grid = computed(() => [
  "grid grid-cols-2 gap-3",
  n.value % 2 === 1 && "[&>:last-child]:col-span-2",
  n.value === 3 && "sm:grid-cols-3 sm:gap-4 sm:[&>:last-child]:col-span-1",
  n.value === 4 && "lg:grid-cols-4",
  n.value >= 5 && "lg:grid-cols-5 lg:[&>:last-child]:col-span-1",
]);
const iconTone = (tone?: StatItem["tone"]) =>
  tone === "secondary"
    ? "bg-secondary/15 text-secondary"
    : tone === "accent"
      ? "bg-accent/20 text-accent-content"
      : "bg-primary/10 text-primary";
</script>

<template>
  <div v-if="kind === 'money'" class="@container">
    <dl class="divide-y divide-base-300 rounded-box border border-base-300 bg-base-100 @4xl:hidden">
      <div v-for="s in items" :key="s.label" class="flex items-center gap-3 px-5 py-3">
        <span class="grid size-8 shrink-0 place-items-center rounded-field" :class="iconTone(s.tone)">
          <AppIcon :name="s.icon" :size="16" />
        </span>
        <dt class="min-w-0 flex-1 text-sm text-base-content/70">{{ s.label }}</dt>
        <dd class="font-semibold whitespace-nowrap tabular-nums">{{ s.value }}</dd>
      </div>
    </dl>
    <div class="hidden grid-cols-3 gap-4 @4xl:grid">
      <AppStat
        v-for="s in items"
        :key="s.label"
        :value="s.value"
        :label="s.label"
        :icon="s.icon"
        :tone="s.tone"
      />
    </div>
  </div>
  <nav v-else-if="label" :class="grid" :aria-label="label">
    <button
      v-for="s in items"
      :key="s.id ?? s.label"
      type="button"
      class="rounded-box text-left transition hover:ring-2 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-primary"
      @click="s.id && emit('pick', s.id)"
    >
      <AppStat :value="s.value" :label="s.label" :icon="s.icon" :tone="s.tone" :stack-lg="n >= 5" />
    </button>
  </nav>
  <div v-else :class="grid">
    <AppStat
      v-for="s in items"
      :key="s.label"
      :value="s.value"
      :label="s.label"
      :icon="s.icon"
      :tone="s.tone"
      :stack-lg="n >= 5"
    />
  </div>
</template>
