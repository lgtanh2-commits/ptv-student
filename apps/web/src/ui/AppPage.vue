<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { cameFromApp, goBack } from "@/features/navigation/back";
import { messages } from "@/messages";
import AppIcon from "./AppIcon.vue";
import AppMenu from "./AppMenu.vue";

// Page frame: a heading with an optional short text, a way back, and actions on the right.
// "Back" goes to the screen the person came from. `backTo` is where it goes when there is no such screen.
// Slots: `meta` (status badges, due text: shown under the title, never with the buttons),
// `actions` (at most 2 buttons, the main one last), `more` (rarer actions as AppMenuItem, in a "⋯" menu).
// On a phone the buttons get their own row under the title and share it equally, so the main one is on the right.
// When there is only the "⋯" menu, it stays at the top right, next to the title.
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
    <header
      class="mb-6 flex gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"
      :class="$slots.more && !$slots.actions ? 'flex-row items-start' : 'flex-col'"
    >
      <div class="min-w-0 flex-1 sm:flex-auto">
        <h1 class="text-2xl font-semibold tracking-tight wrap-anywhere md:text-3xl">{{ title }}</h1>
        <p v-if="subtitle" class="mt-1 text-base-content/70">{{ subtitle }}</p>
        <div v-if="$slots.meta" class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <slot name="meta" />
        </div>
      </div>
      <div
        v-if="$slots.actions || $slots.more"
        class="flex items-center justify-end gap-2 max-sm:[&>.btn]:flex-1 sm:ms-auto sm:flex-wrap"
      >
        <AppMenu v-if="$slots.more" :label="messages.common.moreActions"><slot name="more" /></AppMenu>
        <slot name="actions" />
      </div>
    </header>
    <div class="flex flex-col gap-6"><slot /></div>
  </main>
</template>
