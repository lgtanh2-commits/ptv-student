<script setup lang="ts">
import { useId } from "vue";

defineProps<{
  label: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  /** No empty choice at the top: one of the options is always chosen. */
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string;
}>();
const model = defineModel<string>({ default: "" });
const id = useId();
</script>

<template>
  <!-- min-w-0: a long option name never makes the field (and the page) wider than its column. -->
  <div class="fieldset min-w-0 gap-1 py-0">
    <label :for="id" class="fieldset-legend">{{ label }}</label>
    <select
      :id="id"
      v-model="model"
      :disabled="disabled"
      :aria-invalid="error ? true : undefined"
      class="select min-h-11 w-full min-w-0"
      :class="{ 'select-error': error }"
    >
      <option v-if="!required" value="">{{ placeholder ?? "" }}</option>
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
    <p v-if="hint && !error" class="label whitespace-normal text-base-content/70">{{ hint }}</p>
    <p v-if="error" role="alert" class="label whitespace-normal text-error">{{ error }}</p>
  </div>
</template>
