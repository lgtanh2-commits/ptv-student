<script setup lang="ts">
import { LANGUAGES, type Language } from "@lms/shared";
import { ref } from "vue";
import { fill } from "@/features/text";
import { useLanguageSetting } from "@/features/i18n/useLanguageSetting";
import { useToast } from "@/features/toast/useToast";
import { messages } from "@/messages";
import AppButton from "@/ui/AppButton.vue";
import AppFormActions from "@/ui/AppFormActions.vue";
import AppBadge from "@/ui/AppBadge.vue";
import AppCard from "@/ui/AppCard.vue";
import AppConfirm from "@/ui/AppConfirm.vue";

// The language of the app, and of the emails and notifications sent to this person.
const t = messages.language;
const toast = useToast();
const setting = useLanguageSetting({
  onError: (message) => toast.error(message),
});
const asking = ref(false);
// The dialog closes first: it sits above everything, so it would hide the loading state.
function confirm() {
  asking.value = false;
  void setting.save();
}
// Each language is named in its own language, so a person can find theirs.
const nameOf = (lang: Language) => t[lang];
</script>

<template>
  <AppCard :title="t.title" :description="t.intro">
    <fieldset class="flex flex-col gap-2" :disabled="setting.saving.value">
      <legend class="sr-only">{{ t.title }}</legend>
      <label
        v-for="lang in LANGUAGES"
        :key="lang"
        class="flex min-h-11 cursor-pointer items-center gap-3 rounded-field border border-base-300 px-4 py-3 has-[:checked]:border-primary"
      >
        <input
          v-model="setting.chosen.value"
          type="radio"
          name="language"
          class="radio radio-primary"
          :value="lang"
        />
        <span class="flex-1 font-medium">{{ nameOf(lang) }}</span>
        <AppBadge v-if="lang === setting.current" tone="success">{{ t.inUse }}</AppBadge>
      </label>
    </fieldset>
    <AppFormActions>
      <AppButton :disabled="!setting.changed.value" @click="asking = true">{{ t.save }}</AppButton>
    </AppFormActions>

    <AppConfirm
      v-model="asking"
      :title="fill(t.confirmTitle, { language: nameOf(setting.chosen.value) })"
      :text="fill(t.confirmText, { language: nameOf(setting.chosen.value) })"
      :confirm-label="t.confirmLabel"
      @confirm="confirm"
    />
    <div
      v-if="setting.saving.value"
      role="status"
      class="fixed inset-0 z-[1000] grid place-items-center bg-base-100/90"
    >
      <p class="flex items-center gap-3 text-lg font-medium">
        <span class="loading loading-spinner loading-md" aria-hidden="true" />{{ t.changing }}
      </p>
    </div>
  </AppCard>
</template>
