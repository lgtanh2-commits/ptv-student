<script setup lang="ts">
import { messages } from "@/messages";
import AppIcon from "./AppIcon.vue";

// Short messages that fade away by themselves, or can be closed early. The list comes from the toast store.
defineProps<{ items: { id: number; kind: "success" | "error" | "info"; text: string }[] }>();
const emit = defineEmits<{ dismiss: [id: number] }>();
</script>

<template>
  <div class="toast toast-top toast-end z-50" aria-live="polite">
    <div
      v-for="t in items"
      :key="t.id"
      class="alert alert-soft w-80 items-start shadow-lg"
      :class="{
        'alert-success': t.kind === 'success',
        'alert-error': t.kind === 'error',
        'alert-info': t.kind === 'info',
      }"
      :role="t.kind === 'error' ? 'alert' : 'status'"
    >
      <AppIcon :name="t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'done' : 'info'" :size="18" />
      <span class="flex-1 text-sm">{{ t.text }}</span>
      <button
        type="button"
        class="btn btn-ghost btn-xs btn-square -m-1"
        :aria-label="messages.common.close"
        @click="emit('dismiss', t.id)"
      >
        <AppIcon name="close" :size="16" />
      </button>
    </div>
  </div>
</template>
