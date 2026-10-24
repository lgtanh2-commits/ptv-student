<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";
import AppRowActions from "./AppRowActions.vue";

// One row of a list, the same everywhere. Line 1 is the title, with at most one badge or value on the right
// (`trailing`). Under the title is the meta line: smaller, muted, it wraps (or is cut after 2 lines with `clamp`).
// Optional `leading` (avatar, icon, date chip) on the left.
// `actions` are row buttons (AppRowActions): on a phone a line of their own, at the right; on a wide screen inline at
// the right. `actionsBelow` keeps them under the row on every screen (a narrow column). `below` is full-width content
// under the row (an inline editor, a choice).
// With `to` (a page in the app) or `href` (a web page, opened in a new tab) the whole row is a link, made from the
// title. Links and buttons inside the row stay usable on top of it: they are positioned and come later in the markup,
// so they paint over the stretched link without a z-index (a z-index would trap an open "⋯" menu under the next row).
// `plain` drops the padding (rows in a padded card).
// Names, emails and titles are cut with "…" on one line; put the full value one tap away (the detail page, or `title`).
defineProps<{
  to?: RouteLocationRaw;
  href?: string;
  clamp?: boolean;
  actionsBelow?: boolean;
  plain?: boolean;
  /** The title is struck through (a cancelled lesson). */
  struck?: boolean;
  /** The title is a sentence the reader needs whole: it wraps instead of being cut with "…". */
  wrap?: boolean;
}>();
// A link made from the title, stretched over the whole row.
const stretched = "after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2";
</script>

<template>
  <li
    class="relative flex flex-wrap items-center gap-x-3 gap-y-2"
    :class="[{ 'px-5 py-3': !plain }, { 'hover:bg-base-200/60': to || href }]"
  >
    <div v-if="$slots.leading" class="shrink-0"><slot name="leading" /></div>
    <div class="min-w-0 flex-1">
      <!-- The badge or value is on the title's line, at the right; the meta line under it uses the full width.
           It takes at most 55% of the text column (about 45% of the row), so the title always keeps room. -->
      <div class="flex items-start gap-x-3">
        <p
          class="min-w-0 flex-1 font-medium"
          :class="[wrap ? 'text-pretty' : 'truncate', { 'line-through opacity-60': struck }]"
        >
          <RouterLink v-if="to" :to="to" :class="stretched"><slot name="title" /></RouterLink>
          <a v-else-if="href" :href="href" target="_blank" rel="noopener noreferrer" :class="stretched"
            ><slot name="title"
          /></a>
          <slot v-else name="title" />
        </p>
        <div
          v-if="$slots.trailing"
          class="flex max-w-[55%] min-w-0 shrink-0 items-center justify-end gap-2 [&>.badge]:mt-0.5"
        >
          <slot name="trailing" />
        </div>
      </div>
      <div
        v-if="$slots.meta"
        class="text-sm text-base-content/60 [&_a]:relative"
        :class="{ 'line-clamp-2': clamp }"
      >
        <slot name="meta" />
      </div>
    </div>
    <AppRowActions v-if="$slots.actions" class="relative" :class="{ 'basis-full': actionsBelow }">
      <slot name="actions" />
    </AppRowActions>
    <div v-if="$slots.below" class="relative basis-full"><slot name="below" /></div>
  </li>
</template>
