<script setup lang="ts">
import type { MyWorkItem } from "@lms/shared";
import { computed } from "vue";
import { summaryLine } from "@/components/homeworkLabels";
import { dueWords, isOverdue, scoreText } from "@/features/homework/dates";
import { messages } from "@/messages";
import AppBadge from "@/ui/AppBadge.vue";
import AppIcon from "@/ui/AppIcon.vue";
import AppListRow from "@/ui/AppListRow.vue";

const props = defineProps<{ item: MyWorkItem; showCourse?: boolean }>();
const t = messages.my;

const open = computed(() => ["not_started", "drafted", "revision_requested"].includes(props.item.status));
const overdue = computed(() => open.value && isOverdue(props.item.dueAt));
const label = computed(() => {
  switch (props.item.status) {
    case "returned":
      return { tone: "success" as const, text: scoreText(props.item.score, props.item.maxScore) };
    case "revision_requested":
      return { tone: "error" as const, text: t.again };
    case "submitted":
    case "graded":
      return { tone: "info" as const, text: t.waiting };
    case "drafted":
      return { tone: "neutral" as const, text: t.statusDrafted };
    default:
      return null;
  }
});
</script>

<template>
  <!-- One homework: the state badge on the right of the title, the due words and "late" under it. -->
  <AppListRow :to="`/my/work/${item.id}`">
    <template #leading>
      <span class="grid size-11 place-items-center rounded-field bg-primary/10 text-primary">
        <AppIcon name="attendance" :size="22" />
      </span>
    </template>
    <template #title>{{ item.title }}</template>
    <template #meta>
      <p class="truncate">
        {{ summaryLine(item.questionCount, item.maxScore)
        }}<template v-if="showCourse"> · {{ item.courseName }}</template>
      </p>
      <p
        v-if="open || item.status === 'submitted' || item.isLate"
        class="flex flex-wrap items-center gap-x-2"
      >
        <span
          v-if="open || item.status === 'submitted'"
          :class="overdue ? 'font-medium text-error' : 'text-base-content/70'"
          >{{ dueWords(item.dueAt) }}</span
        >
        <AppBadge v-if="item.isLate" tone="error">{{ messages.grading.late }}</AppBadge>
      </p>
    </template>
    <template v-if="label" #trailing>
      <AppBadge :tone="label.tone">{{ label.text }}</AppBadge>
    </template>
  </AppListRow>
</template>
