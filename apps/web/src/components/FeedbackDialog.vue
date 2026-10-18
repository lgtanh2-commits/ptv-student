<script setup lang="ts">
import { FEEDBACK_KINDS } from "@lms/shared";
import { computed } from "vue";
import { useSendFeedback } from "@/features/feedback/useFeedback";
import { fill } from "@/features/text";
import { useToast } from "@/features/toast/useToast";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppButton from "@/ui/AppButton.vue";
import AppModal from "@/ui/AppModal.vue";
import AppSegmented from "@/ui/AppSegmented.vue";
import AppTextarea from "@/ui/AppTextarea.vue";

// The form for sending feedback. Closes and thanks the person once it was sent.
const t = messages.feedback;
const open = defineModel<boolean>({ default: false });
const toast = useToast();
const { form } = useSendFeedback(() => {
  open.value = false;
  toast.success(t.sent);
});

const labels = {
  inconvenient: t.kindInconvenient,
  bug: t.kindBug,
  feature: t.kindFeature,
};
const options = FEEDBACK_KINDS.map((kind) => ({
  value: kind,
  label: labels[kind],
  tone: "neutral" as const,
}));
const hint = computed(() => fill(t.messageHint, { n: form.values.message.length }));
</script>

<template>
  <AppModal v-model="open" :title="t.dialogTitle" :close-label="messages.common.close">
    <AppAlert v-if="form.formError.value" kind="error">{{ form.formError.value }}</AppAlert>
    <div class="fieldset gap-1 py-0">
      <span class="fieldset-legend">{{ t.kindLabel }}</span>
      <AppSegmented v-model="form.values.kind" :options="options" :label="t.kindLabel" />
    </div>
    <AppTextarea
      v-model="form.values.message"
      :label="t.messageLabel"
      :hint="hint"
      :error="form.errors.value.message"
      :rows="5"
    />
    <p v-if="form.errors.value.kind" role="alert" class="text-sm text-error">{{ form.errors.value.kind }}</p>
    <template #actions>
      <AppButton variant="secondary" :disabled="form.submitting.value" @click="open = false">{{
        messages.common.cancel
      }}</AppButton>
      <AppButton :loading="form.submitting.value" @click="form.submit">{{ t.submit }}</AppButton>
    </template>
  </AppModal>
</template>
