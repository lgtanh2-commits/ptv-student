<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import AppFormActions from "./AppFormActions.vue";

// A dialog. On a phone it is a sheet at the bottom of the screen (near the thumb, above the keyboard) with the buttons
// stacked full width, the main one on top. From `sm` up it is a box in the middle with the buttons in a row on the
// right. The buttons go in the `actions` slot like in a form: secondary (Cancel) first, the main one last.
defineProps<{ title: string; closeLabel: string }>();
const open = defineModel<boolean>({ default: false });
const dialog = ref<HTMLDialogElement>();

function sync(value: boolean) {
  if (value && !dialog.value?.open) dialog.value?.showModal();
  if (!value && dialog.value?.open) dialog.value.close();
}
watch(open, sync, { flush: "post" });
onMounted(() => sync(open.value));
</script>

<template>
  <dialog ref="dialog" class="modal modal-bottom sm:modal-middle" @close="open = false">
    <div
      class="modal-box max-sm:max-h-[calc(100dvh-3rem)]! max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <h2 class="text-lg font-semibold text-balance">{{ title }}</h2>
      <div class="flex flex-col gap-4 py-4"><slot /></div>
      <AppFormActions class="pt-2"><slot name="actions" /></AppFormActions>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button>{{ closeLabel }}</button>
    </form>
  </dialog>
</template>
