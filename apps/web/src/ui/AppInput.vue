<script setup lang="ts">
import { useId } from "vue";

defineProps<{
  disabled?: boolean;
  /** Can be read and copied but not changed, and keeps the normal text color. */
  readonly?: boolean;
  label: string;
  type?: "text" | "email" | "number" | "date" | "time" | "tel" | "url";
  autocomplete?: string;
  error?: string;
  hint?: string;
  inputmode?: "text" | "numeric" | "decimal" | "tel";
  placeholder?: string;
  /** A short value (a score): on a phone the label is on the left and a narrow input on the right, in one row. */
  inline?: boolean;
}>();
const model = defineModel<string>({ default: "" });
const id = useId();
</script>

<template>
  <div
    class="fieldset gap-1 py-0"
    :class="{
      'max-sm:grid-cols-[minmax(0,1fr)_6rem] max-sm:items-center max-sm:gap-x-3 max-sm:[&>p]:col-span-full':
        inline,
    }"
  >
    <label :for="id" class="fieldset-legend" :class="{ 'max-sm:py-0': inline }">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      :type="type ?? 'text'"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error ? `${id}-error` : hint ? `${id}-hint` : undefined"
      class="input min-h-11 w-full"
      :class="{ 'input-error': error }"
    />
    <p v-if="hint && !error" :id="`${id}-hint`" class="label whitespace-normal text-base-content/70">
      {{ hint }}
    </p>
    <p v-if="error" :id="`${id}-error`" role="alert" class="label whitespace-normal text-error">
      {{ error }}
    </p>
  </div>
</template>
