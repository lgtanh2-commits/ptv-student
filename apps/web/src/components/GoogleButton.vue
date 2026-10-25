<script setup lang="ts">
import { anonymousId, signUpClicked } from "@/features/analytics/anon";
import { googleStartUrl, useGoogleAvailable, type GoogleIntent } from "@/features/auth/google";
import { messages } from "@/messages";
import AppButton from "@/ui/AppButton.vue";
import GoogleLogo from "@/ui/GoogleLogo.vue";

/** `place`: where it sits on the welcome page; a click there is counted as a sign up click. */
const props = defineProps<{
  intent: GoogleIntent;
  invite?: string;
  keep?: boolean;
  place?: "hero" | "bottom";
}>();
const available = useGoogleAvailable();

// A full page visit: the server sends the browser to Google, and Google sends it back.
function go() {
  if (props.place) signUpClicked("google", props.place);
  window.location.assign(googleStartUrl({ ...props, anon: anonymousId() }));
}
</script>

<template>
  <AppButton v-if="available" variant="secondary" block @click="go">
    <GoogleLogo />{{ messages.google.continue }}
  </AppButton>
</template>
