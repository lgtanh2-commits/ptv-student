<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { authApi } from "@/features/auth/api";
import { useSession } from "@/features/auth/session";
import { openFresh } from "@/features/i18n/language";
import { useOneClick } from "@/features/auth/useOneClick";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppAuthPage from "@/ui/AppAuthPage.vue";
import AppButton from "@/ui/AppButton.vue";

// This page only shows a button. The link is used up when the person presses it, not when the
// page opens, so an email scanner that visits the link cannot use it up.
const t = messages.verify;
const route = useRoute();
const router = useRouter();
const session = useSession();
const token = computed(() => String(route.query.token ?? ""));

const action = useOneClick(async () => {
  await authApi.verifyEmail(token.value);
  // A new page load when the account's language differs, so the home page is built in it.
  if (await session.load(true)) return openFresh("/");
  await router.replace("/");
});
</script>

<template>
  <AppAuthPage :title="t.title" :subtitle="action.expired.value || !token ? undefined : t.intro">
    <template v-if="action.expired.value || !token">
      <AppAlert kind="error">{{ t.expired }}</AppAlert>
      <AppButton variant="secondary" block @click="router.push('/sign-in')">{{ t.askAgain }}</AppButton>
    </template>
    <template v-else>
      <AppAlert v-if="action.error.value" kind="error">{{ action.error.value }}</AppAlert>
      <AppButton :loading="action.busy.value" block @click="action.run">{{ t.submit }}</AppButton>
    </template>
  </AppAuthPage>
</template>
