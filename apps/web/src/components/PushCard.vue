<script setup lang="ts">
import { usePush } from "@/features/push/usePush";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppBadge from "@/ui/AppBadge.vue";
import AppButton from "@/ui/AppButton.vue";
import AppCard from "@/ui/AppCard.vue";
import AppIcon from "@/ui/AppIcon.vue";

const t = messages.push;
const push = usePush();
</script>

<template>
  <AppCard v-if="push.state.value !== 'loading' && push.state.value !== 'hidden'" :title="t.title">
    <AppAlert v-if="push.error.value" kind="error">{{ push.error.value }}</AppAlert>

    <template v-if="push.state.value === 'on'">
      <div class="flex flex-wrap items-center gap-3">
        <AppBadge tone="success">{{ t.onTitle }}</AppBadge>
        <p class="text-base-content/70">{{ t.text }}</p>
      </div>
      <p class="text-base-content/60 text-sm">{{ t.signedInOnly }}</p>
      <div>
        <AppButton variant="secondary" compact :loading="push.busy.value" @click="push.disable">{{
          t.disableButton
        }}</AppButton>
      </div>
    </template>

    <template v-else>
      <p class="text-base-content/70">{{ t.text }}</p>
      <AppAlert v-if="push.state.value === 'install'" kind="info">{{ t.install }}</AppAlert>
      <AppAlert v-else-if="push.state.value === 'blocked'" kind="warning">{{ t.blocked }}</AppAlert>
      <p v-else-if="push.state.value === 'unsupported'" class="text-base-content/60">{{ t.unsupported }}</p>
      <template v-else>
        <p class="text-base-content/60 text-sm">{{ t.signedInOnly }}</p>
        <div>
          <AppButton :loading="push.busy.value" @click="push.enable"
            ><AppIcon name="bell" :size="16" />{{ t.enableButton }}</AppButton
          >
        </div>
      </template>
    </template>
  </AppCard>
</template>
