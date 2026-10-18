<script setup lang="ts">
import { ref } from "vue";
import FeedbackBoard from "@/components/FeedbackBoard.vue";
import FeedbackDialog from "@/components/FeedbackDialog.vue";
import { messages } from "@/messages";
import AppButton from "@/ui/AppButton.vue";
import AppPage from "@/ui/AppPage.vue";

// What Tutorio has accepted and is building, and a way to send new feedback.
const t = messages.feedback;
const sending = ref(false);
</script>

<template>
  <AppPage :title="t.title" :subtitle="t.intro">
    <template #actions>
      <AppButton @click="sending = true">{{ t.send }}</AppButton>
    </template>
    <FeedbackBoard />
    <FeedbackDialog v-model="sending" />
  </AppPage>
</template>
