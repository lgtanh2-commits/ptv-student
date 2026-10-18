<script setup lang="ts">
import DeviceSettings from "@/components/DeviceSettings.vue";
import LanguageCard from "@/components/LanguageCard.vue";
import { useSession } from "@/features/auth/session";
import { messages } from "@/messages";
import AppPage from "@/ui/AppPage.vue";

// Everyone can choose a language. Only teachers also see their devices and Telegram.
const t = messages.settings;
const session = useSession();
</script>

<template>
  <AppPage :title="t.title" :subtitle="t.intro">
    <LanguageCard />
    <DeviceSettings v-if="session.isTeacher" />
  </AppPage>
</template>
