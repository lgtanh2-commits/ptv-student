<script setup lang="ts">
import { HOMEWORK_IMAGE_MAX_BYTES, HOMEWORK_IMAGE_MAX_COUNT, HOMEWORK_IMAGE_TYPES } from "@lms/shared";
import { onBeforeUnmount, ref, useId } from "vue";
import { api } from "@/api/client";
import HomeworkImageGallery from "@/components/HomeworkImageGallery.vue";
import { messageOf } from "@/features/errors";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";

const props = defineProps<{ uploadPath: string; disabled?: boolean; label?: string }>();
const ids = defineModel<string[]>({ required: true });
const emit = defineEmits<{ busy: [busy: boolean] }>();
const id = useId();
const t = messages.homeworkImages;
const busy = ref(false);
const error = ref<string | null>(null);
const abort = new AbortController();
onBeforeUnmount(() => abort.abort());

async function pick(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (busy.value || props.disabled || files.length === 0) return;

  error.value = null;
  if (ids.value.length + files.length > HOMEWORK_IMAGE_MAX_COUNT) {
    error.value = t.tooMany;
    return;
  }
  if (files.some((file) => !HOMEWORK_IMAGE_TYPES.some((type) => type === file.type))) {
    error.value = t.badType;
    return;
  }
  if (files.some((file) => file.size > HOMEWORK_IMAGE_MAX_BYTES)) {
    error.value = t.tooBig;
    return;
  }

  const added = [...ids.value];
  busy.value = true;
  emit("busy", true);
  try {
    for (const file of files) {
      const result = await api<{ id: string }>(props.uploadPath, {
        method: "POST",
        body: file,
        signal: abort.signal,
      });
      added.push(result.id);
      ids.value = [...added];
    }
  } catch (err) {
    if (!abort.signal.aborted) error.value = messageOf(err);
  } finally {
    busy.value = false;
    emit("busy", false);
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <label :for="id" class="font-medium">{{ label ?? t.title }}</label>
    <HomeworkImageGallery
      :ids="ids"
      removable
      :disabled="disabled || busy"
      @remove="ids = ids.filter((item) => item !== $event)"
    />
    <input
      :id="id"
      type="file"
      multiple
      :aria-label="t.choose"
      :aria-describedby="`${id}-hint`"
      :accept="HOMEWORK_IMAGE_TYPES.join(',')"
      :disabled="disabled || busy || ids.length >= HOMEWORK_IMAGE_MAX_COUNT"
      class="file-input min-h-11 w-full sm:max-w-sm"
      @change="pick"
    />
    <p :id="`${id}-hint`" class="text-sm text-base-content/70">{{ t.hint }}</p>
    <p v-if="busy" role="status" class="text-sm">{{ t.uploading }}</p>
    <AppAlert v-if="error" kind="error">{{ error }}</AppAlert>
  </div>
</template>
