<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import type { AssignmentInfo } from "@lms/shared";
import { assignmentStatusText, assignmentStatusTone, summaryLine } from "@/components/homeworkLabels";
import { formatWhen } from "@/features/format";
import { useCourseHomework } from "@/features/homework/useHomework";
import { usePaging } from "@/features/paging";
import { fill } from "@/features/text";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppBadge from "@/ui/AppBadge.vue";
import AppButton from "@/ui/AppButton.vue";
import AppCard from "@/ui/AppCard.vue";
import AppEmpty from "@/ui/AppEmpty.vue";
import AppIcon from "@/ui/AppIcon.vue";
import AppListRow from "@/ui/AppListRow.vue";
import AppLoading from "@/ui/AppLoading.vue";
import AppModal from "@/ui/AppModal.vue";
import AppPager from "@/ui/AppPager.vue";

const props = defineProps<{ courseId: string }>();
const t = messages.homework;
const router = useRouter();
const { items, loading, error, remove } = useCourseHomework(props.courseId, { deleted: t.deleted });
const paging = usePaging(items);
const newHomework = () => router.push(`/courses/${props.courseId}/homework/new`);

// Deleting asks first, and says what will happen.
const deleting = ref<AssignmentInfo | null>(null);
const deleteWords = computed(() => {
  const a = deleting.value;
  if (!a) return [];
  return [
    fill(t.deleteText, { title: a.title }),
    ...(a.status !== "draft" ? [t.deleteLive] : []),
    ...(a.counts.handedIn > 0 ? [fill(t.deleteHandedIn, { n: a.counts.handedIn })] : []),
  ];
});
const removing = ref(false);
async function confirmDelete() {
  const a = deleting.value;
  if (!a) return;
  removing.value = true;
  try {
    await remove(a.id);
  } finally {
    removing.value = false;
    deleting.value = null;
  }
}
</script>

<template>
  <AppCard :title="t.title" flush>
    <!-- With no homework, the button is in the empty message, so it is not shown twice. -->
    <template v-if="!loading && items.length > 0" #actions>
      <AppButton compact @click="newHomework"><AppIcon name="plus" :size="16" />{{ t.new }}</AppButton>
    </template>
    <AppAlert v-if="error" kind="error" class="m-5">{{ error }}</AppAlert>
    <div v-if="loading" class="p-5"><AppLoading :label="messages.common.loading" :rows="2" /></div>
    <AppEmpty v-else-if="items.length === 0" compact :title="t.empty" :text="t.emptyText">
      <AppButton @click="newHomework"><AppIcon name="plus" :size="18" />{{ t.new }}</AppButton>
    </AppEmpty>
    <ul v-else class="divide-y divide-base-300">
      <AppListRow v-for="a in paging.shown.value" :key="a.id" :to="`/assignments/${a.id}`">
        <template #leading>
          <span class="grid size-11 place-items-center rounded-field bg-primary/10 text-primary">
            <AppIcon name="attendance" :size="22" />
          </span>
        </template>
        <template #title>{{ a.title }}</template>
        <template #meta>
          <p>
            {{ summaryLine(a.questions.length, a.maxScore) }} ·
            {{ a.dueAt ? `${t.due} ${formatWhen(a.dueAt)}` : t.noDue }}
          </p>
          <p
            v-if="a.status !== 'draft' || a.counts.toGrade > 0"
            class="flex flex-wrap items-center gap-x-2 gap-y-1"
          >
            <span v-if="a.status !== 'draft'" class="text-base-content/70">{{
              fill(t.handedIn, { n: a.counts.handedIn, total: a.counts.targeted })
            }}</span>
            <AppBadge v-if="a.counts.toGrade > 0" tone="warning">{{
              fill(t.toScore, { n: a.counts.toGrade })
            }}</AppBadge>
          </p>
        </template>
        <template #trailing>
          <AppBadge :tone="assignmentStatusTone[a.status]">{{ assignmentStatusText[a.status] }}</AppBadge>
        </template>
        <template #actions>
          <AppButton
            variant="ghost"
            compact
            icon="trash"
            :label="fill(t.deleteOne, { title: a.title })"
            @click="deleting = a"
          />
        </template>
      </AppListRow>
    </ul>
    <AppPager v-model:page="paging.page.value" :pages="paging.pages.value" />
  </AppCard>

  <AppModal
    :model-value="deleting !== null"
    :title="t.deleteTitle"
    :close-label="messages.common.close"
    @update:model-value="deleting = null"
  >
    <p v-for="(line, i) in deleteWords" :key="i">{{ line }}</p>
    <template #actions>
      <AppButton variant="ghost" @click="deleting = null">{{ messages.common.cancel }}</AppButton>
      <AppButton variant="danger" :loading="removing" @click="confirmDelete">{{ t.delete }}</AppButton>
    </template>
  </AppModal>
</template>
