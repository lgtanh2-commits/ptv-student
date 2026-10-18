<script setup lang="ts">
import type { FeedbackCard, FeedbackKind } from "@lms/shared";
import { computed } from "vue";
import { useFeedbackBoard } from "@/features/feedback/useFeedback";
import { formatLocalDay } from "@/features/format";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppButton from "@/ui/AppButton.vue";
import AppEmpty from "@/ui/AppEmpty.vue";
import AppLoading from "@/ui/AppLoading.vue";

// The public board: three columns of what Tutorio accepted, is building and finished.
const t = messages.feedback;
const { board, loading, error, reload } = useFeedbackBoard();
void reload();

const columns = computed(() => [
  { key: "todo", name: t.todo, empty: t.emptyTodo, cards: board.value?.todo ?? [] },
  { key: "inProgress", name: t.inProgress, empty: t.emptyInProgress, cards: board.value?.inProgress ?? [] },
  { key: "done", name: t.done, empty: t.emptyDone, cards: board.value?.done ?? [] },
]);

const kindLabel: Record<FeedbackKind, string> = {
  inconvenient: t.kindInconvenient,
  bug: t.kindBug,
  feature: t.kindFeature,
};
// The line under a title: "New feature · Teacher · 12/10/2026".
function meta(card: FeedbackCard): string {
  const role = card.role === "teacher" ? t.roleTeacher : t.roleStudent;
  return [kindLabel[card.kind], role, formatLocalDay(card.createdAt)].join(" · ");
}
</script>

<template>
  <AppLoading v-if="loading && !board" :label="t.loading" />
  <AppAlert v-else-if="error" kind="error">
    <p>{{ error }}</p>
    <AppButton class="mt-2" variant="secondary" compact @click="reload">{{
      messages.common.tryAgain
    }}</AppButton>
  </AppAlert>
  <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-3" role="group" :aria-label="t.board">
    <section
      v-for="col in columns"
      :key="col.key"
      class="flex min-w-0 flex-col gap-3 rounded-box bg-base-300/50 p-3"
      :aria-labelledby="`feedback-${col.key}`"
    >
      <h2 :id="`feedback-${col.key}`" class="flex items-center gap-2 px-1 text-sm font-semibold uppercase">
        {{ col.name }}
        <span class="rounded-full bg-base-100 px-2 py-0.5 text-xs font-medium tabular-nums">{{
          col.cards.length
        }}</span>
      </h2>
      <ul v-if="col.cards.length" class="flex flex-col gap-2">
        <li
          v-for="card in col.cards"
          :key="card.id"
          class="rounded-field border border-base-300 bg-base-100 p-3 shadow-sm"
        >
          <p class="font-semibold break-words">{{ card.title }}</p>
          <p class="mt-1 text-xs text-base-content/70">{{ meta(card) }}</p>
        </li>
      </ul>
      <AppEmpty v-else icon="message" :title="col.empty" />
    </section>
  </div>
</template>
