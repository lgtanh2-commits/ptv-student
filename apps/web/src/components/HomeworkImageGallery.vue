<script setup lang="ts">
import { fill } from "@/features/text";
import { messages } from "@/messages";
import AppButton from "@/ui/AppButton.vue";

defineProps<{ ids?: string[]; assignmentId?: string; removable?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ remove: [id: string] }>();
const t = messages.homeworkImages;

function imageUrl(id: string, assignmentId?: string) {
  const path = `/api/homework-images/${encodeURIComponent(id)}`;
  return assignmentId ? `${path}?assignment=${encodeURIComponent(assignmentId)}` : path;
}
</script>

<template>
  <ul v-if="ids?.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    <li v-for="(id, index) in ids" :key="id" class="relative min-w-0">
      <a
        :href="imageUrl(id, assignmentId)"
        target="_blank"
        rel="noopener"
        class="block overflow-hidden rounded-field border border-base-300 bg-base-200"
      >
        <img
          :src="imageUrl(id, assignmentId)"
          :alt="fill(t.open, { n: index + 1 })"
          loading="lazy"
          class="aspect-square w-full object-contain"
        />
      </a>
      <AppButton
        v-if="removable"
        variant="secondary"
        icon="close"
        :label="fill(t.remove, { n: index + 1 })"
        :disabled="disabled"
        class="absolute end-1 top-1"
        @click="emit('remove', id)"
      />
    </li>
  </ul>
</template>
