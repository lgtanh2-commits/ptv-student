<script setup lang="ts">
// A picture of the teacher's home screen, built from the app's own pieces with example data, so it
// keeps the app's look when the look changes. Decoration only: screen readers hear one label.
// Every row has the same shape (icon, title, detail line, optional end), so all rows are one height.
import { messages } from "@/messages";
import AppBadge from "@/ui/AppBadge.vue";
import AppIcon, { type IconName } from "@/ui/AppIcon.vue";
import AppProgress from "@/ui/AppProgress.vue";

const t = messages.landing.preview;
const rows: { icon: IconName; title: string; detail: string; end?: "progress" | "paid" }[] = [
  { icon: "calendar", title: t.lesson1, detail: t.lesson1Time },
  { icon: "calendar", title: t.lesson2, detail: t.lesson2Time },
  { icon: "book", title: t.homework, detail: t.handedIn, end: "progress" },
  { icon: "invoice", title: t.receipt, detail: t.amount, end: "paid" },
];
</script>

<template>
  <div role="img" :aria-label="t.label">
    <div class="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm" aria-hidden="true">
      <div class="flex items-center justify-between gap-3">
        <p class="font-semibold">{{ t.title }}</p>
        <span class="text-sm text-base-content/70">{{ t.week }}</span>
      </div>
      <p class="mt-4 flex items-center gap-3 rounded-field bg-primary/10 px-4 py-3 text-sm font-medium">
        <AppIcon name="bell" :size="18" class="text-primary" />{{ t.notice }}
      </p>
      <ul class="mt-3 flex flex-col gap-3">
        <li
          v-for="r in rows"
          :key="r.title"
          class="flex items-center gap-3 rounded-field border border-base-300 px-4 py-3"
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-field bg-primary/10 text-primary">
            <AppIcon :name="r.icon" :size="18" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium">{{ r.title }}</span>
            <span class="block truncate text-sm text-base-content/70">{{ r.detail }}</span>
          </span>
          <span v-if="r.end === 'progress'" class="w-16 shrink-0">
            <AppProgress :value="8" :max="12" :label="t.handedIn" />
          </span>
          <AppBadge v-else-if="r.end === 'paid'" tone="success">{{ t.paid }}</AppBadge>
        </li>
      </ul>
    </div>
  </div>
</template>
