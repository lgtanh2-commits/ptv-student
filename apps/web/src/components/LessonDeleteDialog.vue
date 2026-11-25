<script setup lang="ts">
import type { LessonInfo } from "@lms/shared";
import { messages } from "@/messages";
import AppButton from "@/ui/AppButton.vue";
import AppModal from "@/ui/AppModal.vue";

defineProps<{ busy: "this" | "following" | null }>();
const lesson = defineModel<LessonInfo | null>({ required: true });
const emit = defineEmits<{ confirm: [scope: "this" | "following"] }>();
const t = messages.lessons;
</script>

<template>
  <AppModal
    :model-value="lesson !== null"
    :title="t.deleteTitle"
    :close-label="messages.common.close"
    @update:model-value="!$event && !busy && (lesson = null)"
  >
    <p>{{ lesson?.seriesId ? t.deleteSeriesText : t.deleteText }}</p>
    <template #actions>
      <AppButton variant="ghost" :disabled="!!busy" @click="lesson = null">{{
        messages.common.cancel
      }}</AppButton>
      <AppButton
        v-if="lesson?.seriesId"
        variant="secondary"
        :loading="busy === 'this'"
        :disabled="!!busy"
        @click="emit('confirm', 'this')"
        >{{ t.deleteOnly }}</AppButton
      >
      <AppButton
        v-if="lesson?.seriesId"
        variant="danger"
        :loading="busy === 'following'"
        :disabled="!!busy"
        @click="emit('confirm', 'following')"
        >{{ t.deleteFollowing }}</AppButton
      >
      <AppButton v-else variant="danger" :loading="busy === 'this'" @click="emit('confirm', 'this')">
        {{ t.delete }}
      </AppButton>
    </template>
  </AppModal>
</template>
