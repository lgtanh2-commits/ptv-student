<script setup lang="ts">
import { provide } from "vue";
import { menuInlineKey } from "./menu";

// Shows AppMenuItem actions as ordinary buttons, for when there is room and a "⋯" menu would only hide them.
provide(menuInlineKey, true);
</script>

<template>
  <slot />
</template>
