<script setup lang="ts">
import { computed } from "vue";
import { usePush } from "@/features/push/usePush";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppButton from "@/ui/AppButton.vue";
import AppLink from "@/ui/AppLink.vue";

const t = messages.push;
const push = usePush();
const show = computed(
  () => !push.hintDismissed.value && (push.state.value === "off" || push.state.value === "install"),
);
</script>

<template>
  <AppAlert v-if="show" kind="info">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span>{{ t.hint }}</span>
      <AppLink to="/settings">{{ t.hintAction }}</AppLink>
      <AppButton variant="ghost" compact @click="push.dismissHint">{{ t.hintLater }}</AppButton>
    </div>
  </AppAlert>
</template>
