<script setup lang="ts">
import type { SessionInfo } from "@lms/shared";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { authApi } from "@/features/auth/api";
import { useSession } from "@/features/auth/session";
import { formatWhen } from "@/features/format";
import { usePaging } from "@/features/paging";
import { useToast } from "@/features/toast/useToast";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppBadge from "@/ui/AppBadge.vue";
import AppButton from "@/ui/AppButton.vue";
import AppCard from "@/ui/AppCard.vue";
import AppConfirm from "@/ui/AppConfirm.vue";
import AppEmpty from "@/ui/AppEmpty.vue";
import AppIcon from "@/ui/AppIcon.vue";
import AppLoading from "@/ui/AppLoading.vue";
import AppPager from "@/ui/AppPager.vue";

const t = messages.devices;
const router = useRouter();
const session = useSession();
const toast = useToast();
const sessions = ref<SessionInfo[]>([]);
const paging = usePaging(sessions);
const loading = ref(true);
const error = ref<string | null>(null);

async function load() {
  sessions.value = (await authApi.sessions()).sessions;
  loading.value = false;
}

const endingId = ref<string | null>(null);
const askingEnd = ref<SessionInfo | null>(null);
async function end(s: SessionInfo) {
  error.value = null;
  endingId.value = s.id;
  try {
    await authApi.endSession(s.id);
    if (s.current) {
      await session.load(true);
      await router.replace("/");
    } else {
      await load();
      toast.success(t.ended);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : messages.common.somethingWrong;
  } finally {
    endingId.value = null;
    askingEnd.value = null;
  }
}

const endingAll = ref(false);
const askingAll = ref(false);
async function endAll() {
  endingAll.value = true;
  try {
    await authApi.signOutEverywhere();
    await session.load(true);
    await router.replace("/");
  } finally {
    endingAll.value = false;
    askingAll.value = false;
  }
}

// A rough guess of the kind of device, only to pick an icon.
const isPhone = (ua: string | null) => /iphone|android|mobile/i.test(ua ?? "");
onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-6">
    <AppAlert v-if="error" kind="error">{{ error }}</AppAlert>
    <AppLoading v-if="loading" :label="messages.common.loading" />
    <AppCard v-else-if="sessions.length === 0"><AppEmpty compact :title="t.empty" /></AppCard>
    <AppCard v-else flush :title="messages.settings.devicesTitle" :description="t.intro">
      <template #actions>
        <AppButton variant="danger" compact :loading="endingAll" @click="askingAll = true"
          ><AppIcon name="sign-out" :size="16" />{{ t.signOutAll }}</AppButton
        >
      </template>
      <ul class="divide-y divide-base-300">
        <li v-for="s in paging.shown.value" :key="s.id" class="flex flex-wrap items-center gap-4 px-5 py-4">
          <span class="grid size-11 place-items-center rounded-field bg-base-200 text-base-content/70">
            <AppIcon :name="isPhone(s.userAgent) ? 'mobile' : 'devices'" :size="22" />
          </span>
          <div class="min-w-0 flex-1 basis-56">
            <p class="truncate font-medium">{{ s.userAgent ?? "-" }}</p>
            <p class="text-sm text-base-content/60">{{ t.lastUsed }}: {{ formatWhen(s.lastSeenAt) }}</p>
          </div>
          <AppBadge v-if="s.current" tone="success">{{ t.thisDevice }}</AppBadge>
          <AppButton variant="secondary" compact :loading="endingId === s.id" @click="askingEnd = s">{{
            t.signOut
          }}</AppButton>
        </li>
      </ul>
      <AppPager v-model:page="paging.page.value" :pages="paging.pages.value" />
    </AppCard>

    <AppConfirm
      v-model="askingAll"
      :title="t.endAllTitle"
      :text="t.endAllText"
      :confirm-label="t.signOutAll"
      :loading="endingAll"
      @confirm="endAll"
    />
    <AppConfirm
      :model-value="askingEnd !== null"
      :title="t.endTitle"
      :text="t.endText"
      :confirm-label="t.signOut"
      :loading="endingId !== null"
      @update:model-value="(v) => !v && (askingEnd = null)"
      @confirm="askingEnd && end(askingEnd)"
    />
  </div>
</template>
