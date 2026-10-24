<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { formatDayLong } from "@/features/format";
import { useAttendance } from "@/features/lessons/useAttendance";
import { useLessonCancel, useLessonRestore } from "@/features/lessons/useLessons";
import { usePaging } from "@/features/paging";
import { fill } from "@/features/text";
import { messages } from "@/messages";
import AppActionBar from "@/ui/AppActionBar.vue";
import AppAlert from "@/ui/AppAlert.vue";
import AppAvatar from "@/ui/AppAvatar.vue";
import AppBadge from "@/ui/AppBadge.vue";
import AppButton from "@/ui/AppButton.vue";
import AppCard from "@/ui/AppCard.vue";
import AppEmpty from "@/ui/AppEmpty.vue";
import AppIcon from "@/ui/AppIcon.vue";
import AppListRow from "@/ui/AppListRow.vue";
import AppLoading from "@/ui/AppLoading.vue";
import AppMenuItem from "@/ui/AppMenuItem.vue";
import AppModal from "@/ui/AppModal.vue";
import AppPage from "@/ui/AppPage.vue";
import AppPager from "@/ui/AppPager.vue";
import AppSegmented from "@/ui/AppSegmented.vue";
import AppStatGroup from "@/ui/AppStatGroup.vue";

const t = messages.attendance;
const l = messages.lessons;
const route = useRoute();
const a = useAttendance(String(route.params.id));
// Ten students a page. The marks of all pages are saved together.
const paging = usePaging(() => a.students.value);

const lesson = computed(() => a.sheet.value?.lesson ?? null);
const title = computed(() => lesson.value?.title || lesson.value?.courseName || t.title);
const options = [
  { value: "attended", label: t.attended, tone: "success" as const },
  { value: "absent", label: t.absent, tone: "error" as const },
];

const cancelledText = (n: number) => (n === 1 ? l.cancelled : fill(l.cancelledMany, { n }));
const { asking, confirmingScope, askCancel, doCancel } = useLessonCancel(
  { cancelled: cancelledText },
  a.load,
);
const { restoringId, restore } = useLessonRestore({ restored: l.restored }, a.load);
</script>

<template>
  <AppPage
    :title="title"
    :subtitle="lesson ? `${formatDayLong(lesson.date)} · ${lesson.startTime} - ${lesson.endTime}` : undefined"
    :back-to="lesson ? `/courses/${lesson.courseId}?tab=lessons` : '/schedule'"
    :back-label="t.back"
  >
    <template v-if="lesson?.status === 'scheduled'" #more>
      <AppMenuItem danger @click="askCancel(lesson)"
        ><AppIcon name="ban" :size="16" />{{ l.cancel }}</AppMenuItem
      >
    </template>
    <template v-else-if="lesson?.status === 'cancelled'" #actions>
      <AppButton variant="secondary" :loading="restoringId === lesson.id" @click="restore(lesson.id)">
        <AppIcon name="restore" :size="18" />{{ l.restore }}
      </AppButton>
    </template>

    <AppLoading v-if="a.loading.value" :label="messages.common.loading" />
    <AppAlert v-else-if="a.notFound.value" kind="error">{{ t.notFound }}</AppAlert>
    <template v-else-if="lesson">
      <AppAlert v-if="a.error.value" kind="error">{{ a.error.value }}</AppAlert>
      <AppAlert v-if="lesson.status === 'cancelled'" kind="warning">{{ t.cancelledNote }}</AppAlert>
      <AppAlert v-else-if="!a.isPast.value" kind="info">{{ t.notStarted }}</AppAlert>
      <AppAlert v-else kind="info">{{ t.hint }}</AppAlert>

      <AppCard v-if="lesson.title || lesson.place || lesson.onlineUrl">
        <dl class="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <!-- The course is written here only when the title above is something else, so nothing is said twice. -->
          <div v-if="lesson.title" class="min-w-0">
            <dt class="text-sm text-base-content/60">{{ t.course }}</dt>
            <dd class="font-medium">{{ lesson.courseName }}</dd>
          </div>
          <div v-if="lesson.place" class="min-w-0">
            <dt class="text-sm text-base-content/60">{{ t.place }}</dt>
            <dd class="break-words font-medium">{{ lesson.place }}</dd>
          </div>
          <div v-if="lesson.onlineUrl" class="min-w-0 sm:col-span-2">
            <dt class="text-sm text-base-content/60">{{ t.onlineLink }}</dt>
            <dd>
              <a
                :href="lesson.onlineUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="link link-primary inline-flex max-w-full items-center gap-1 break-all font-medium"
                ><AppIcon name="video" :size="16" class="shrink-0" />{{ lesson.onlineUrl }}</a
              >
            </dd>
          </div>
        </dl>
      </AppCard>

      <AppStatGroup
        :items="[
          { value: a.attended.value, label: t.attended, icon: 'done', tone: 'secondary' },
          { value: a.absent.value, label: t.absent, icon: 'ban', tone: 'accent' },
        ]"
      />

      <AppCard :title="fill(t.students, { n: a.students.value.length })" flush>
        <template v-if="a.canSave.value && a.students.value.length" #actions>
          <AppButton variant="ghost" compact @click="a.setAll('attended')">{{ t.allAttended }}</AppButton>
          <AppButton variant="ghost" compact @click="a.setAll('absent')">{{ t.allAbsent }}</AppButton>
        </template>
        <AppEmpty
          v-if="a.students.value.length === 0"
          compact
          :title="t.noStudents"
          :text="t.noStudentsText"
        />
        <ul v-else class="divide-y divide-base-300">
          <AppListRow v-for="s in paging.shown.value" :key="s.studentId">
            <template #leading><AppAvatar :name="s.name" /></template>
            <template #title>{{ s.name }}</template>
            <template v-if="s.joinedAfter || !s.inCourse" #meta>
              <p class="flex flex-wrap gap-x-2 text-xs">
                <span v-if="s.joinedAfter">{{ t.joinedAfter }}</span>
                <span v-if="!s.inCourse">{{ t.left }}</span>
              </p>
            </template>
            <template v-if="!s.saved" #trailing>
              <AppBadge tone="warning">{{ t.unsaved }}</AppBadge>
            </template>
            <template #actions>
              <AppSegmented
                v-model="a.choice.value[s.studentId]!"
                :options="options"
                :label="s.name"
                block
                :class="{ 'pointer-events-none opacity-60': !a.canSave.value }"
              />
            </template>
          </AppListRow>
        </ul>
        <AppPager v-model:page="paging.page.value" :pages="paging.pages.value" />
      </AppCard>

      <AppActionBar v-if="a.canSave.value && a.students.value.length">
        <template #status>
          <p class="text-base-content/70">
            {{ fill(t.summary, { a: a.attended.value, b: a.absent.value }) }}
          </p>
        </template>
        <AppButton :loading="a.busy.value" :disabled="!a.dirty.value" @click="a.save(t.saved)">
          <AppIcon name="check" :size="18" />{{ t.save }}
        </AppButton>
      </AppActionBar>
    </template>

    <AppModal
      :model-value="asking !== null"
      :title="l.cancelTitle"
      :close-label="messages.common.close"
      @update:model-value="asking = null"
    >
      <p>{{ asking?.seriesId ? l.cancelText : l.cancelConfirmText }}</p>
      <template #actions>
        <AppButton variant="ghost" @click="asking = null">{{ messages.common.cancel }}</AppButton>
        <template v-if="asking?.seriesId">
          <AppButton variant="secondary" :loading="confirmingScope === 'this'" @click="doCancel('this')">{{
            l.cancelOnly
          }}</AppButton>
          <AppButton
            variant="danger"
            :loading="confirmingScope === 'following'"
            @click="doCancel('following')"
            >{{ l.cancelFollowing }}</AppButton
          >
        </template>
        <AppButton v-else variant="danger" :loading="confirmingScope === 'this'" @click="doCancel('this')">{{
          l.cancelYes
        }}</AppButton>
      </template>
    </AppModal>
  </AppPage>
</template>
