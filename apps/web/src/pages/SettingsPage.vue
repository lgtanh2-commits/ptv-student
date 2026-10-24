<script setup lang="ts">
import DeviceSettings from "@/components/DeviceSettings.vue";
import LanguageCard from "@/components/LanguageCard.vue";
import PushCard from "@/components/PushCard.vue";
import { useSession } from "@/features/auth/session";
import { messages } from "@/messages";
import AppPage from "@/ui/AppPage.vue";

// Everyone can choose a language and turn on notifications on this device. Only teachers also see their
// devices.
const t = messages.settings;
const session = useSession();
</script>

<template>
  <AppPage :title="t.title" :subtitle="t.intro">
    <LanguageCard />
    <PushCard />
    <DeviceSettings v-if="session.isTeacher" />
  </AppPage>
</template>
