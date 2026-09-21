<script setup lang="ts">
import { computed, ref } from "vue";
import LessonFields from "@/components/LessonFields.vue";
import { formatDayShort, formatWeek, startOfWeek, today } from "@/features/format";
import { lessonLabel } from "@/features/lessons/status";
import { LESSON_LENGTHS, useEditLesson, useNewLesson } from "@/features/lessons/useLessons";
import { useSchedule } from "@/features/lessons/useSchedule";
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
import AppPage from "@/ui/AppPage.vue";
import AppSelect from "@/ui/AppSelect.vue";

const t = messages.schedule;
const l = messages.lessons;
const { monday, days, lessons, loading, error, next, previous, thisWeek, goToWeekOf, load } = useSchedule();

const edit = useEditLesson({ updated: (n) => (n === 1 ? l.updatedOne : fill(l.updated, { n })) }, load);
const lengthText: Record<number, string> = { 30: l.len30, 60: l.len60, 90: l.len90, 120: l.len120 };
const lengths = LESSON_LENGTHS.map((m) => ({ value: String(m), label: lengthText[m]! }));
const scopeOptions = [
  { value: "this", label: l.editScopeThis },
  { value: "following", label: l.editScopeFollowing },
];
const repeatOptions = [
  { value: "none", label: l.repeatNone },
  { value: "weekly", label: l.repeatWeekly },
  { value: "every_2_weeks", label: l.repeatBiweekly },
];

// Making lessons from here. They can also be made on the page of a course.
const adding = ref(false);
const made = useNewLesson({ added: (n) => (n === 1 ? l.addedOne : fill(l.added, { n })) }, (created) => {
  adding.value = false;
  goToWeekOf(created[0]?.date ?? monday.value);
});
const courseOptions = computed(() => made.courses.value.map((c) => ({ value: c.id, label: c.name })));
async function openAdd() {
  adding.value = true;
  // Today when the week on screen is this week, else the first day of that week.
  await made.open(startOfWeek(today()) === monday.value ? today() : monday.value);
}
function add() {
  if (!made.courseId.value) {
    made.courseError.value = t.chooseCourse;
    return;
  }
  made.courseError.value = undefined;
  void made.form.submit();
}
/** The second line of a lesson: the course (when the title already says something else), the students and the place. */
const details = (lesson: (typeof lessons.value)[number]) =>
  [
    lesson.title ? lesson.courseName : "",
    lesson.students.length ? lesson.students.join(", ") : t.noStudents,
    lesson.place,
  ]
    .filter((x) => x !== "")
    .join(" · ");

const statusText = {
  scheduled: l.statusScheduled,
  held: l.statusHeld,
  cancelled: l.statusCancelled,
  needs_attendance: l.statusNeeds,
} as const;
const statusTone = {
  scheduled: "info",
  held: "success",
  cancelled: "neutral",
  needs_attendance: "warning",
} as const;
</script>

<template>
  <AppPage :title="t.title" :subtitle="t.subtitle">
    <template #actions>
      <div class="join">
        <button type="button" class="btn join-item min-h-11" :aria-label="t.previous" @click="previous">
          <AppIcon name="left" />
        </button>
        <button type="button" class="btn join-item min-h-11 min-w-44 font-medium" @click="thisWeek">
          {{ formatWeek(monday) }}
        </button>
        <button type="button" class="btn join-item min-h-11" :aria-label="t.next" @click="next">
          <AppIcon name="right" />
        </button>
      </div>
      <AppButton v-if="lessons.length > 0" @click="openAdd"
        ><AppIcon name="calendar-plus" :size="18" />{{ t.addLesson }}</AppButton
      >
    </template>

    <AppAlert v-if="error" kind="error">{{ error }}</AppAlert>
    <AppLoading v-if="loading && lessons.length === 0" :label="messages.common.loading" :rows="5" />
    <AppCard v-else-if="!loading && lessons.length === 0">
      <AppEmpty icon="calendar" :title="t.noneWeek" :text="t.noneWeekText">
        <AppButton @click="openAdd">{{ t.addLesson }}</AppButton>
      </AppEmpty>
    </AppCard>
    <div v-else class="flex flex-col gap-3">
      <section
        v-for="day in days"
        :key="day.date"
        class="flex flex-col gap-3 rounded-box border bg-base-100 p-4 sm:flex-row"
        :class="day.isToday ? 'border-primary' : 'border-base-300'"
      >
        <div class="w-32 shrink-0">
          <p class="font-semibold">{{ formatDayShort(day.date) }}</p>
          <AppBadge v-if="day.isToday" tone="info">{{ t.today }}</AppBadge>
        </div>
        <p v-if="day.lessons.length === 0" class="text-sm text-base-content/40">{{ t.empty }}</p>
        <ul v-else class="flex flex-1 flex-col gap-2">
          <li v-for="lesson in day.lessons" :key="lesson.id" class="flex items-stretch gap-1">
            <RouterLink
              :to="`/lessons/${lesson.id}/attendance`"
              class="flex flex-1 flex-wrap items-center gap-3 rounded-field border border-base-300 px-3 py-2 hover:bg-base-200/60"
            >
              <span class="w-28 shrink-0 text-sm font-medium"
                >{{ lesson.startTime }} - {{ lesson.endTime }}</span
              >
              <span class="min-w-0 flex-1 basis-40">
                <span
                  class="block truncate font-medium"
                  :class="{ 'line-through opacity-60': lesson.status === 'cancelled' }"
                  >{{ lesson.title || lesson.courseName }}</span
                >
                <span class="block truncate text-sm text-base-content/60">{{ details(lesson) }}</span>
              </span>
              <AppBadge :tone="statusTone[lessonLabel(lesson)]">{{
                statusText[lessonLabel(lesson)]
              }}</AppBadge>
            </RouterLink>
            <button
              v-if="lesson.status === 'scheduled'"
              type="button"
              class="btn btn-ghost btn-square shrink-0"
              :aria-label="l.edit"
              @click="edit.open(lesson)"
            >
              <AppIcon name="edit" :size="18" />
            </button>
          </li>
        </ul>
      </section>
    </div>

    <AppModal v-model="adding" :title="t.addLesson" :close-label="messages.common.close">
      <AppLoading v-if="made.loadingCourses.value" :label="messages.common.loading" />
      <AppAlert v-else-if="courseOptions.length === 0 && made.courseError.value" kind="error">{{
        made.courseError.value
      }}</AppAlert>
      <p v-else-if="courseOptions.length === 0" class="text-base-content/70">{{ t.noCourses }}</p>
      <form
        v-else
        id="add-lesson"
        class="grid gap-x-4 gap-y-3 md:grid-cols-2"
        novalidate
        @submit.prevent="add"
      >
        <AppAlert v-if="made.form.formError.value" kind="error" class="md:col-span-2">{{
          made.form.formError.value
        }}</AppAlert>
        <div class="md:col-span-2">
          <AppSelect
            v-model="made.courseId.value"
            :label="t.course"
            :options="courseOptions"
            :placeholder="t.chooseCourse"
            :error="made.courseError.value"
          />
        </div>
        <LessonFields :values="made.form.values" :errors="made.form.errors.value" />
      </form>
      <template #actions>
        <AppButton variant="ghost" @click="adding = false">{{ messages.common.cancel }}</AppButton>
        <AppButton
          v-if="courseOptions.length"
          type="submit"
          :loading="made.form.submitting.value"
          @click="add"
          >{{ l.add }}</AppButton
        >
        <RouterLink v-else to="/courses/new" class="btn btn-primary min-h-11">{{ t.newCourse }}</RouterLink>
      </template>
    </AppModal>

    <AppModal
      :model-value="edit.editing.value !== null"
      :title="l.editTitle"
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
          :label="l.date"
          type="date"
          :error="edit.form.errors.value.date"
        />
        <AppInput
          v-model="edit.form.values.startTime"
          :label="l.startTime"
          type="time"
          :error="edit.form.errors.value.startTime"
        />
        <AppSelect
          v-model="edit.form.values.durationMinutes"
          :label="l.duration"
          :options="lengths"
          required
          :error="edit.form.errors.value.durationMinutes"
        />
        <AppInput
          v-model="edit.form.values.title"
          :label="l.lessonTitle"
          :error="edit.form.errors.value.title"
        />
        <AppInput
          v-model="edit.form.values.onlineUrl"
          :label="l.online"
          type="url"
          :hint="l.onlineHint"
          :error="edit.form.errors.value.onlineUrl"
        />
        <div v-if="edit.editing.value?.seriesId" class="md:col-span-2">
          <AppSelect
            v-model="edit.form.values.scope"
            :label="l.editScopeLabel"
            :options="scopeOptions"
            :hint="l.editScopeText"
            required
          />
        </div>
        <template v-if="edit.editing.value?.seriesId && edit.form.values.scope === 'following'">
          <div class="md:col-span-2">
            <AppCheckbox v-model="edit.form.values.changeRepeat" :label="l.editChangeRepeat" />
          </div>
          <template v-if="edit.form.values.changeRepeat">
            <AppSelect
              v-model="edit.form.values.repeat"
              :label="l.repeat"
              :options="repeatOptions"
              required
              :error="edit.form.errors.value.repeat"
            />
            <AppInput
              v-if="edit.form.values.repeat !== 'none'"
              v-model="edit.form.values.repeatUntil"
              :label="l.repeatUntil"
              type="date"
              :hint="l.repeatUntilHint"
              :error="edit.form.errors.value.repeatUntil"
            />
          </template>
        </template>
      </form>
      <template #actions>
        <AppButton variant="ghost" @click="edit.editing.value = null">{{ messages.common.cancel }}</AppButton>
        <AppButton type="submit" form="edit-lesson" :loading="edit.form.submitting.value">{{
          l.saveChanges
        }}</AppButton>
      </template>
    </AppModal>
  </AppPage>
</template>
