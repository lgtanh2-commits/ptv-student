<script setup lang="ts">
// Asks before something that cannot be taken back easily: removing, cancelling, archiving.
import { messages } from "@/messages";
import AppButton from "./AppButton.vue";
import AppModal from "./AppModal.vue";

defineProps<{ title: string; text: string; confirmLabel: string; loading?: boolean }>();
const open = defineModel<boolean>({ default: false });
const emit = defineEmits<{ confirm: [] }>();
</script>

<template>
  <AppModal v-model="open" :title="title" :close-label="messages.common.close">
    <p>{{ text }}</p>
    <template #actions>
      <AppButton variant="ghost" @click="open = false">{{ messages.common.cancel }}</AppButton>
      <AppButton variant="danger" :loading="loading" @click="emit('confirm')">{{ confirmLabel }}</AppButton>
    </template>
  </AppModal>
</template>
