<script setup lang="ts">
import { useId } from "vue";

defineProps<{ label: string }>();
const model = defineModel<boolean>({ default: false });
const id = useId();
</script>

<template>
  <!-- The box lines up with the first line of the label, also when the label takes two lines. -->
  <div class="flex items-start gap-3 py-2.5">
    <input :id="id" v-model="model" type="checkbox" class="checkbox checkbox-primary shrink-0" />
    <label :for="id" class="cursor-pointer pt-0.5 text-sm">{{ label }}</label>
  </div>
</template>
