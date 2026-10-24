<script setup lang="ts">
// The actions of one list row (Edit, Delete, Resend): compact buttons grouped at the right edge of the row. On a phone
// the group takes its own line under the row and stays on the right; it is never indented on the left. On a wide
// screen it sits inline at the right of the row. More than two actions: put the rarer ones in an AppMenu.
</script>

<template>
  <div class="ms-auto flex flex-wrap items-center justify-end gap-1 max-sm:basis-full">
    <slot />
  </div>
</template>
