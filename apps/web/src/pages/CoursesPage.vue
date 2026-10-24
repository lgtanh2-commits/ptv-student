<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useCourseList } from "@/features/courses/useCourses";
import { formatDay, formatVnd } from "@/features/format";
import { usePaging } from "@/features/paging";
import { fill } from "@/features/text";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppBadge from "@/ui/AppBadge.vue";
import AppButton from "@/ui/AppButton.vue";
import AppEmpty from "@/ui/AppEmpty.vue";
import AppIcon from "@/ui/AppIcon.vue";
import AppLoading from "@/ui/AppLoading.vue";
import AppPage from "@/ui/AppPage.vue";
import AppPager from "@/ui/AppPager.vue";
import AppProgress from "@/ui/AppProgress.vue";
import AppSelect from "@/ui/AppSelect.vue";

const t = messages.courses;
const router = useRouter();
const { courses, shown, loading, status, error } = useCourseList();
const paging = usePaging(shown, { resetOn: status });
const filters = computed(() => [
  { value: "active", label: t.statusActive },
  { value: "draft", label: t.statusDraft },
  { value: "archived", label: t.statusArchived },
]);

const statusText = { draft: t.statusDraft, active: t.statusActive, archived: t.statusArchived } as const;
const statusTone = { draft: "warning", active: "success", archived: "neutral" } as const;
</script>

<template>
  <AppPage :title="t.title" :subtitle="t.subtitle">
    <template v-if="courses.length > 0" #actions>
      <AppButton @click="router.push('/courses/new')"
        ><AppIcon name="plus" :size="18" />{{ t.new }}</AppButton
      >
    </template>
    <AppAlert v-if="error" kind="error">{{ error }}</AppAlert>
    <!-- Right under the "New course" button. -->
    <div class="flex justify-end">
      <div class="w-full sm:w-56">
        <AppSelect v-model="status" :label="t.filterStatus" :options="filters" :placeholder="t.allStatuses" />
      </div>
    </div>
    <AppLoading v-if="loading" :label="messages.common.loading" />
    <div v-else-if="shown.length === 0" class="rounded-box border border-base-300 bg-base-100">
      <AppEmpty v-if="courses.length > 0" icon="book" :title="t.noMatch" :text="t.noMatchText" />
      <AppEmpty v-else icon="book" :title="t.emptyTitle" :text="t.empty">
        <AppButton @click="router.push('/courses/new')"
          ><AppIcon name="plus" :size="18" />{{ t.new }}</AppButton
        >
      </AppEmpty>
    </div>
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <RouterLink
        v-for="c in paging.shown.value"
        :key="c.id"
        :to="`/courses/${c.id}`"
        class="group flex flex-col gap-4 rounded-box border border-base-300 bg-base-100 p-5 transition hover:border-primary/50 hover:shadow-sm"
      >
        <!-- On a phone the icon is small and sits before the title, the badge on the right of that line. -->
        <div class="flex flex-1 flex-col gap-1">
          <div class="flex items-center gap-3 sm:flex-wrap sm:items-start sm:justify-between sm:gap-y-4">
            <span
              class="grid size-9 shrink-0 place-items-center rounded-field bg-primary/10 text-primary sm:size-11 [&>svg]:size-4.5 sm:[&>svg]:size-5.5"
            >
              <AppIcon name="book" :size="22" />
            </span>
            <h2 class="min-w-0 flex-1 font-semibold group-hover:text-primary sm:order-last sm:basis-full">
              {{ c.name }}
            </h2>
            <AppBadge class="shrink-0" :tone="statusTone[c.status]">{{ statusText[c.status] }}</AppBadge>
          </div>
          <p v-if="c.description" class="line-clamp-2 text-sm text-base-content/60">{{ c.description }}</p>
        </div>
        <div class="flex flex-col gap-2">
          <p class="flex items-center justify-between text-sm">
            <span class="font-medium">{{ formatVnd(c.pricePerLesson) }}</span>
            <span class="text-base-content/60">
              {{
                c.maxStudents === null
                  ? fill(t.placesNoLimit, { n: c.enrolledCount })
                  : fill(t.places, { n: c.enrolledCount, max: c.maxStudents })
              }}
            </span>
          </p>
          <AppProgress
            v-if="c.maxStudents !== null"
            :value="c.enrolledCount"
            :max="c.maxStudents"
            :label="t.title"
          />
          <p v-if="c.startDate || c.endDate" class="text-xs text-base-content/60">
            <span v-if="c.startDate" class="whitespace-nowrap"
              >{{ t.from }} {{ formatDay(c.startDate) }}</span
            >
            <template v-if="c.startDate && c.endDate"> · </template>
            <span v-if="c.endDate" class="whitespace-nowrap">{{ t.until }} {{ formatDay(c.endDate) }}</span>
          </p>
        </div>
      </RouterLink>
    </div>
    <AppPager v-if="!loading" v-model:page="paging.page.value" :pages="paging.pages.value" plain />
  </AppPage>
</template>
