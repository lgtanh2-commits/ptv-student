<script setup lang="ts">
// A line with a short word in the middle ("or"). `plain`: a longer caption, shown centred without the lines,
// which would shrink to stubs on a phone.
defineProps<{ plain?: boolean }>();
</script>

<template>
  <p v-if="plain" class="text-center text-sm text-pretty text-base-content/60"><slot /></p>
  <div v-else class="divider my-0 text-sm text-base-content/50"><slot /></div>
</template>
