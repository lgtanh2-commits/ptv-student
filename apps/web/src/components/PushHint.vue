<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { usePush } from "@/features/push/usePush";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppButton from "@/ui/AppButton.vue";

const t = messages.push;
const push = usePush();
const router = useRouter();
const show = computed(
  () => !push.hintDismissed.value && (push.state.value === "off" || push.state.value === "install"),
);
</script>

<template>
  <AppAlert v-if="show" kind="info">
    {{ t.hint }}
    <template #actions>
      <AppButton variant="ghost" compact @click="push.dismissHint">{{ t.hintLater }}</AppButton>
      <AppButton compact @click="router.push('/settings')">{{ t.hintAction }}</AppButton>
    </template>
  </AppAlert>
</template>
