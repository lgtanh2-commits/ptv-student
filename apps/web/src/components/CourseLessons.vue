<script setup lang="ts">
import { lessonLabel } from "@/features/lessons/status";
import type { LessonInfo } from "@lms/shared";
import { computed, ref } from "vue";
import LessonFields from "@/components/LessonFields.vue";
import { LESSON_LENGTHS, useCourseLessons, useEditLesson } from "@/features/lessons/useLessons";
import { usePaging } from "@/features/paging";
import { formatDayShort } from "@/features/format";
import { fill } from "@/features/text";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppBadge from "@/ui/AppBadge.vue";
import AppButton from "@/ui/AppButton.vue";
import AppCard from "@/ui/AppCard.vue";
import AppCheckbox from "@/ui/AppCheckbox.vue";
import AppEmpty from "@/ui/AppEmpty.vue";
import AppIcon from "@/ui/AppIcon.vue";
import AppInput from "@/ui/AppInput.vue";
import AppLoading from "@/ui/AppLoading.vue";
import AppModal from "@/ui/AppModal.vue";
import AppPager from "@/ui/AppPager.vue";
import AppSelect from "@/ui/AppSelect.vue";
import { useRouter } from "vue-router";

const props = defineProps<{ courseId: string }>();
const t = messages.lessons;
const router = useRouter();

const { loading, error, load, form, cancel, restore, parts } = useCourseLessons(props.courseId, {
  added: (n) => (n === 1 ? t.addedOne : fill(t.added, { n })),
});

const edit = useEditLesson({ updated: (n) => (n === 1 ? t.updatedOne : fill(t.updated, { n })) }, load);
const lengthText: Record<number, string> = { 30: t.len30, 60: t.len60, 90: t.len90, 120: t.len120 };
const lengths = LESSON_LENGTHS.map((m) => ({ value: String(m), label: lengthText[m]! }));
const scopeOptions = [
  { value: "this", label: t.editScopeThis },
  { value: "following", label: t.editScopeFollowing },
];
const repeatOptions = [
  { value: "none", label: t.repeatNone },
  { value: "weekly", label: t.repeatWeekly },
  { value: "every_2_weeks", label: t.repeatBiweekly },
];

// Ten lessons a page, in the lessons to come and in the earlier ones (each has its own pages).
const upcomingPaging = usePaging(() => parts.value.upcoming);
const pastPaging = usePaging(() => parts.value.past);
const groups = computed(() => [
  { key: "upcoming", title: t.upcoming, paging: upcomingPaging },
  { key: "past", title: t.past, paging: pastPaging },
]);

const cancelledText = (n: number) => (n === 1 ? t.cancelled : fill(t.cancelledMany, { n }));
const statusText = {
  scheduled: t.statusScheduled,
  held: t.statusHeld,
  cancelled: t.statusCancelled,
  needs_attendance: t.statusNeeds,
} as const;
const statusTone = {
  scheduled: "info",
  held: "success",
  cancelled: "neutral",
  needs_attendance: "warning",
} as const;

// A lesson in a weekly series asks what to cancel; a single lesson is cancelled at once.
const asking = ref<LessonInfo | null>(null);
const cancellingId = ref<string | null>(null);
function askCancel(l: LessonInfo) {
  if (l.seriesId) {
    asking.value = l;
    return;
  }
  cancellingId.value = l.id;
  void cancel(l.id, "this", cancelledText).finally(() => (cancellingId.value = null));
}
const confirmingScope = ref<"this" | "following" | null>(null);
async function doCancel(scope: "this" | "following") {
  const l = asking.value;
  if (!l) return;
  confirmingScope.value = scope;
  try {
    await cancel(l.id, scope, cancelledText);
  } finally {
    confirmingScope.value = null;
    asking.value = null;
  }
}

const restoringId = ref<string | null>(null);
async function doRestore(l: LessonInfo) {
  restoringId.value = l.id;
  try {
    await restore(l.id, t.restored);
  } finally {
    restoringId.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <AppCard :title="t.addTitle" :description="t.addText">
      <form class="grid gap-x-4 gap-y-3 md:grid-cols-2" novalidate @submit.prevent="form.submit">
        <AppAlert v-if="form.formError.value" kind="error" class="md:col-span-2">{{
          form.formError.value
        }}</AppAlert>
        <LessonFields :values="form.values" :errors="form.errors.value" />
        <div class="md:col-span-2">
          <AppButton type="submit" :loading="form.submitting.value"
            ><AppIcon name="calendar-plus" :size="18" />{{ t.add }}</AppButton
          >
        </div>
      </form>
    </AppCard>

    <AppAlert v-if="error" kind="error">{{ error }}</AppAlert>
    <AppLoading v-if="loading" :label="messages.common.loading" />
    <AppCard v-else-if="upcomingPaging.total.value === 0 && pastPaging.total.value === 0">
      <AppEmpty icon="calendar" :title="t.empty" :text="t.emptyText" />
    </AppCard>

    <template v-for="group in groups" :key="group.key">
      <AppCard v-if="group.paging.total.value" :title="group.title" flush>
        <ul class="divide-y divide-base-300">
          <li
            v-for="l in group.paging.shown.value"
            :key="l.id"
            class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
          >
            <span
              class="grid w-14 shrink-0 place-items-center rounded-field py-1.5"
              :class="
                l.status === 'cancelled' ? 'bg-base-200 text-base-content/50' : 'bg-primary/10 text-primary'
              "
            >
              <span class="text-xs font-medium uppercase">{{ formatDayShort(l.date).split(" ")[0] }}</span>
              <span class="text-lg font-semibold leading-tight">{{ l.date.slice(8) }}</span>
            </span>
            <div class="min-w-0 flex-1 basis-48">
              <p
                class="truncate font-medium"
                :class="{ 'line-through opacity-60': l.status === 'cancelled' }"
              >
                {{ l.title || formatDayShort(l.date) }}
              </p>
              <p class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-base-content/60">
                <span class="inline-flex items-center gap-1"
                  ><AppIcon name="clock" :size="14" />{{ l.startTime }} - {{ l.endTime }}</span
                >
                <span v-if="l.place" class="inline-flex items-center gap-1"
                  ><AppIcon name="place" :size="14" />{{ l.place }}</span
                >
                <a
                  v-if="l.onlineUrl"
                  :href="l.onlineUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="link link-primary inline-flex items-center gap-1"
                  ><AppIcon name="video" :size="14" />{{ t.join }}</a
                >
                <span v-if="l.seriesId" class="inline-flex items-center gap-1"
                  ><AppIcon name="repeat" :size="14" />{{ t.weeklySeries }}</span
                >
              </p>
            </div>
            <AppBadge :tone="statusTone[lessonLabel(l)]">{{ statusText[lessonLabel(l)] }}</AppBadge>
            <div class="flex gap-1">
              <AppButton
                v-if="l.status !== 'cancelled'"
                variant="secondary"
                compact
                @click="router.push(`/lessons/${l.id}/attendance`)"
                ><AppIcon name="attendance" :size="16" />{{ t.takeAttendance }}</AppButton
              >
              <AppButton v-if="l.status === 'scheduled'" variant="ghost" compact @click="edit.open(l)"
                ><AppIcon name="edit" :size="16" />{{ t.edit }}</AppButton
              >
              <AppButton
                v-if="l.status === 'scheduled'"
                variant="ghost"
                compact
                :loading="cancellingId === l.id"
                @click="askCancel(l)"
                >{{ t.cancel }}</AppButton
              >
              <AppButton
                v-if="l.status === 'cancelled'"
                variant="ghost"
                compact
                :loading="restoringId === l.id"
                @click="doRestore(l)"
                ><AppIcon name="restore" :size="16" />{{ t.restore }}</AppButton
              >
            </div>
          </li>
        </ul>
        <AppPager v-model:page="group.paging.page.value" :pages="group.paging.pages.value" />
      </AppCard>
    </template>

    <AppModal
      :model-value="asking !== null"
      :title="t.cancelTitle"
      :close-label="messages.common.close"
      @update:model-value="asking = null"
    >
      <p>{{ t.cancelText }}</p>
      <template #actions>
        <AppButton variant="secondary" :loading="confirmingScope === 'this'" @click="doCancel('this')">{{
          t.cancelOnly
        }}</AppButton>
        <AppButton
          variant="danger"
          :loading="confirmingScope === 'following'"
          @click="doCancel('following')"
          >{{ t.cancelFollowing }}</AppButton
        >
      </template>
    </AppModal>

    <AppModal
      :model-value="edit.editing.value !== null"
      :title="t.editTitle"
      :close-label="messages.common.close"
      @update:model-value="(v) => !v && (edit.editing.value = null)"
    >
      <form
        id="edit-lesson"
        class="grid gap-x-4 gap-y-3 md:grid-cols-2"
        novalidate
        @submit.prevent="edit.form.submit"
      >
        <AppAlert v-if="edit.form.formError.value" kind="error" class="md:col-span-2">{{
          edit.form.formError.value
        }}</AppAlert>
        <AppInput
          v-model="edit.form.values.date"
          :label="t.date"
          type="date"
          :error="edit.form.errors.value.date"
        />
        <AppInput
          v-model="edit.form.values.startTime"
          :label="t.startTime"
          type="time"
          :error="edit.form.errors.value.startTime"
        />
        <AppSelect
          v-model="edit.form.values.durationMinutes"
          :label="t.duration"
          :options="lengths"
          required
          :error="edit.form.errors.value.durationMinutes"
        />
        <AppInput
          v-model="edit.form.values.title"
          :label="t.lessonTitle"
          :error="edit.form.errors.value.title"
        />
        <AppInput
          v-model="edit.form.values.onlineUrl"
          :label="t.online"
          type="url"
          :hint="t.onlineHint"
          :error="edit.form.errors.value.onlineUrl"
        />
        <div v-if="edit.editing.value?.seriesId" class="md:col-span-2">
          <AppSelect
            v-model="edit.form.values.scope"
            :label="t.editScopeLabel"
            :options="scopeOptions"
            :hint="t.editScopeText"
            required
          />
        </div>
        <template v-if="edit.editing.value?.seriesId && edit.form.values.scope === 'following'">
          <div class="md:col-span-2">
            <AppCheckbox v-model="edit.form.values.changeRepeat" :label="t.editChangeRepeat" />
          </div>
          <template v-if="edit.form.values.changeRepeat">
            <AppSelect
              v-model="edit.form.values.repeat"
              :label="t.repeat"
              :options="repeatOptions"
              required
              :error="edit.form.errors.value.repeat"
            />
            <AppInput
              v-if="edit.form.values.repeat !== 'none'"
              v-model="edit.form.values.repeatUntil"
              :label="t.repeatUntil"
              type="date"
              :hint="t.repeatUntilHint"
              :error="edit.form.errors.value.repeatUntil"
            />
          </template>
        </template>
      </form>
      <template #actions>
        <AppButton variant="ghost" @click="edit.editing.value = null">{{ messages.common.cancel }}</AppButton>
        <AppButton type="submit" form="edit-lesson" :loading="edit.form.submitting.value">{{
          t.saveChanges
        }}</AppButton>
      </template>
    </AppModal>
  </div>
</template>
