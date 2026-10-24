<script setup lang="ts">
// A small choice between a few options, shown as joined buttons (for example Attended / Absent). Every option has the
// same width (the widest label decides). On a phone each option is 44px tall.
// `block`: on a phone the group fills the width. `stack`: on a phone one option per line, labels on the left (for long
// labels that would wrap side by side). On a wide screen both are a normal row at its natural width.
defineProps<{
  options: { value: string; label: string; tone: "success" | "error" | "neutral" }[];
  label: string;
  block?: boolean;
  stack?: boolean;
}>();
const model = defineModel<string>({ required: true });
</script>

<template>
  <div
    class="join grid max-w-full auto-cols-fr"
    :class="
      stack
        ? 'join-vertical w-full grid-flow-row sm:join-horizontal sm:w-auto sm:grid-flow-col'
        : ['grid-flow-col', block ? 'w-full sm:w-auto' : 'w-max']
    "
    role="group"
    :aria-label="label"
  >
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="btn join-item btn-sm h-auto min-h-11 min-w-0 px-4 py-1.5 leading-tight whitespace-normal text-balance sm:min-h-9"
      :class="[
        { 'max-sm:justify-start max-sm:text-start': stack },
        model === o.value
          ? {
              'btn-success': o.tone === 'success',
              'btn-error': o.tone === 'error',
              'btn-neutral': o.tone === 'neutral',
            }
          : 'btn-ghost border-base-300',
      ]"
      :aria-pressed="model === o.value"
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>
