<script setup lang="ts">
import { Comment, computed, useSlots, type VNode } from "vue";
import { useRouter } from "vue-router";
import { cameFromApp, goBack } from "@/features/navigation/back";
import { messages } from "@/messages";
import AppIcon from "./AppIcon.vue";
import AppMenu from "./AppMenu.vue";
import AppMenuInline from "./AppMenuInline.vue";

// Page frame: a heading with an optional short text, a way back, and actions on the right.
// "Back" goes to the screen the person came from. `backTo` is where it goes when there is no such screen.
// Slots: `meta` (status badges, due text: on the title's line on a wide screen, under the title on a phone; never
// with the buttons),
// `actions` (at most 2 buttons, the main one last), `more` (rarer actions as AppMenuItem).
// The `more` actions show as plain buttons, left of the others, whenever there is room: always on a wide screen, and
// on a phone when `actions` has fewer than 2 buttons. Only on a phone with 2 buttons already do they go into a "⋯"
// menu, which then sits at the top right of the title row (so its list opens inward). The buttons get their own row
// under the title on a phone. A label never wraps: two buttons share the row when they fit (the main one on the
// right), otherwise each takes a full line with the main one on top. On a wide screen it is all on the right.
const props = defineProps<{
  title: string;
  subtitle?: string;
  narrow?: boolean;
  backTo?: string;
  backLabel?: string;
}>();
const router = useRouter();
const fromApp = cameFromApp();
const label = computed(() => (fromApp ? messages.common.back : props.backLabel));
const href = computed(() => (props.backTo ? router.resolve(props.backTo).href : undefined));
const slots = useSlots();
/** How many buttons `actions` shows right now (a v-if that is off leaves a comment, which does not count). */
const countActions = (): number => (slots.actions?.() ?? []).filter((v: VNode) => v.type !== Comment).length;
const menuOnPhone = (): boolean => Boolean(slots.more) && countActions() >= 2;
function back(event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // open in a new tab as usual
  event.preventDefault();
  goBack(router, props.backTo ?? "/");
}
</script>

<template>
  <main class="mx-auto w-full px-4 py-6 md:px-8 md:py-8" :class="narrow ? 'max-w-md' : 'max-w-6xl'">
    <a
      v-if="backTo"
      :href="href"
      class="mb-3 inline-flex min-h-8 items-center gap-1 text-sm text-base-content/70 hover:text-base-content"
      @click="back"
    >
      <AppIcon name="back" :size="16" />{{ label }}
    </a>
    <header class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div class="flex min-w-0 items-start gap-3 sm:flex-1">
        <!-- Phone: title, short text, then the badges under them. Wide screen: the badges on the title's line. -->
        <div class="flex min-w-0 flex-1 flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
          <h1 class="min-w-0 text-2xl font-semibold tracking-tight wrap-anywhere md:text-3xl">{{ title }}</h1>
          <p v-if="subtitle" class="order-2 mt-1 text-base-content/70 sm:order-3 sm:basis-full">
            {{ subtitle }}
          </p>
          <div
            v-if="$slots.meta"
            class="order-3 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:order-2 sm:mt-0"
          >
            <slot name="meta" />
          </div>
        </div>
        <AppMenu v-if="menuOnPhone()" class="sm:hidden" :label="messages.common.moreActions"
          ><slot name="more"
        /></AppMenu>
      </div>
      <div
        v-if="$slots.actions || $slots.more"
        class="flex flex-wrap-reverse items-center gap-2 max-sm:[&_.btn]:grow max-sm:[&_.btn]:basis-auto max-sm:[&_.btn]:whitespace-nowrap sm:ms-auto sm:shrink-0 sm:flex-nowrap sm:justify-end sm:[&_.btn]:whitespace-nowrap"
      >
        <div v-if="$slots.more" class="contents" :class="{ 'max-sm:hidden': menuOnPhone() }">
          <AppMenuInline><slot name="more" /></AppMenuInline>
        </div>
        <slot name="actions" />
      </div>
    </header>
    <div class="flex flex-col gap-6"><slot /></div>
  </main>
</template>
