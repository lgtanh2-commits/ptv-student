<script setup lang="ts">
import { useMyCourses } from "@/features/my/useMy";
import { formatDayShort } from "@/features/format";
import { fill } from "@/features/text";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppBadge from "@/ui/AppBadge.vue";
import AppEmpty from "@/ui/AppEmpty.vue";
import AppIcon from "@/ui/AppIcon.vue";
import AppLoading from "@/ui/AppLoading.vue";
import AppPage from "@/ui/AppPage.vue";

const t = messages.my;
const { courses, loading, error } = useMyCourses();
</script>

<template>
  <AppPage :title="t.coursesTitle" :subtitle="t.coursesText">
    <AppAlert v-if="error" kind="error">{{ error }}</AppAlert>
    <AppLoading v-if="loading" :label="messages.common.loading" />
    <div v-else-if="courses.length === 0" class="rounded-box border border-base-300 bg-base-100">
      <AppEmpty icon="book" :title="t.noCourses" :text="t.noCoursesText" />
    </div>
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="c in courses"
        :key="c.id"
        :to="`/my/courses/${c.id}`"
        class="group flex flex-col gap-4 rounded-box border border-base-300 bg-base-100 p-5 transition hover:border-primary/50 hover:shadow-sm"
      >
        <!-- On a phone the icon is small and sits before the title, the badge on the right of that line. -->
        <div class="flex flex-1 flex-col gap-1">
          <div class="flex items-center gap-3 sm:flex-wrap sm:items-start sm:justify-between sm:gap-y-4">
            <span
              class="grid size-9 shrink-0 place-items-center rounded-field bg-primary/10 text-primary sm:size-11 [&>svg]:size-4.5 sm:[&>svg]:size-5.5"
              ><AppIcon name="book" :size="22"
            /></span>
            <h2 class="min-w-0 flex-1 font-semibold group-hover:text-primary sm:order-last sm:basis-full">
              {{ c.name }}
            </h2>
            <AppBadge v-if="c.openWork > 0" class="shrink-0" tone="warning">{{
              fill(t.openWork, { n: c.openWork })
            }}</AppBadge>
          </div>
          <p class="line-clamp-2 text-sm text-base-content/60">
            {{ c.description || fill(t.teacher, { name: c.teacherName }) }}
          </p>
        </div>
        <p class="text-sm text-base-content/70">
          <template v-if="c.nextLesson"
            >{{ t.next }}:
            <span class="whitespace-nowrap"
              >{{ formatDayShort(c.nextLesson.date) }}, {{ c.nextLesson.startTime }}</span
            ></template
          >
          <template v-else>{{ t.noNext }}</template>
        </p>
      </RouterLink>
    </div>
  </AppPage>
</template>
