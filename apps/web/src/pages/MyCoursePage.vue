<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import WorkRow from "@/components/WorkRow.vue";
import { formatDayShort, formatTimeRange, hostOf } from "@/features/format";
import { useMyCourse } from "@/features/my/useMy";
import { usePaging } from "@/features/paging";
import { fill } from "@/features/text";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppBadge from "@/ui/AppBadge.vue";
import AppCard from "@/ui/AppCard.vue";
import AppEmpty from "@/ui/AppEmpty.vue";
import AppIcon from "@/ui/AppIcon.vue";
import AppListRow from "@/ui/AppListRow.vue";
import AppLoading from "@/ui/AppLoading.vue";
import AppPage from "@/ui/AppPage.vue";
import AppPager from "@/ui/AppPager.vue";

const t = messages.my;
const route = useRoute();
const { data, groups, loading, notFound, error } = useMyCourse(String(route.params.id));
// Ten rows a page in each of the three lists.
const work = computed(() => [
  ...groups.value.again,
  ...groups.value.todo,
  ...groups.value.waiting,
  ...groups.value.done,
]);
const workPaging = usePaging(work);
const lessonPaging = usePaging(() => data.value?.lessons ?? []);
const materialPaging = usePaging(() => data.value?.materials ?? []);
const statusText = { scheduled: t.scheduled, held: t.held, cancelled: t.cancelled } as const;
const statusTone = { scheduled: "info", held: "success", cancelled: "neutral" } as const;
</script>

<template>
  <AppPage
    :title="data?.course.name ?? t.coursesTitle"
    :subtitle="data ? fill(t.teacher, { name: data.course.teacherName }) : undefined"
    back-to="/my/courses"
    :back-label="t.backToCourses"
  >
    <AppLoading v-if="loading" :label="messages.common.loading" />
    <AppAlert v-else-if="notFound" kind="error">{{ t.notFound }}</AppAlert>
    <AppAlert v-else-if="error" kind="error">{{ error }}</AppAlert>
    <template v-else-if="data">
      <AppCard v-if="data.course.description"
        ><p class="whitespace-pre-wrap">{{ data.course.description }}</p></AppCard
      >

      <AppCard :title="t.homework" flush>
        <AppEmpty v-if="data.work.length === 0" compact :title="t.noHomework" />
        <ul v-else class="divide-y divide-base-300">
          <WorkRow v-for="w in workPaging.shown.value" :key="w.id" :item="w" />
        </ul>
        <AppPager v-model:page="workPaging.page.value" :pages="workPaging.pages.value" />
      </AppCard>

      <div class="grid gap-6 lg:grid-cols-2">
        <AppCard :title="t.lessons" flush>
          <AppEmpty v-if="data.lessons.length === 0" compact :title="t.noLessons" />
          <ul v-else class="divide-y divide-base-300">
            <AppListRow v-for="l in lessonPaging.shown.value" :key="l.id" :struck="l.status === 'cancelled'">
              <template #title>{{ l.title || formatDayShort(l.date) }}</template>
              <template #meta>
                <!-- On a phone the date and the place are on separate lines, so every row has the same shape. -->
                <p class="flex flex-col gap-x-3 sm:flex-row sm:flex-wrap">
                  <span>{{ formatDayShort(l.date) }}, {{ formatTimeRange(l.startTime, l.endTime) }}</span>
                  <span v-if="l.place" class="inline-flex min-w-0 items-center gap-1"
                    ><AppIcon name="place" :size="14" /><span class="truncate">{{ l.place }}</span></span
                  >
                  <a
                    v-if="l.onlineUrl"
                    :href="l.onlineUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="link link-primary inline-flex items-center gap-1 self-start"
                    ><AppIcon name="video" :size="14" />{{ t.join }}</a
                  >
                </p>
              </template>
              <template #trailing>
                <AppBadge :tone="statusTone[l.status]">{{ statusText[l.status] }}</AppBadge>
              </template>
            </AppListRow>
          </ul>
          <AppPager v-model:page="lessonPaging.page.value" :pages="lessonPaging.pages.value" />
        </AppCard>

        <AppCard :title="t.materials" flush>
          <AppEmpty v-if="data.materials.length === 0" compact :title="t.noMaterials" />
          <ul v-else class="divide-y divide-base-300">
            <AppListRow v-for="m in materialPaging.shown.value" :key="m.id" :href="m.url">
              <template #leading>
                <span class="grid size-10 place-items-center rounded-field bg-base-200 text-base-content/70"
                  ><AppIcon name="link" :size="18"
                /></span>
              </template>
              <template #title
                ><span class="link link-primary">{{ m.title }}</span></template
              >
              <template #meta
                ><p class="truncate">{{ hostOf(m.url) }}</p></template
              >
            </AppListRow>
          </ul>
          <AppPager v-model:page="materialPaging.page.value" :pages="materialPaging.pages.value" />
        </AppCard>
      </div>
    </template>
  </AppPage>
</template>
