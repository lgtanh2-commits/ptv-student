<script setup lang="ts">
import AppTable from "./AppTable.vue";

// A list of records that is a table on a wide screen and stacked rows on a phone, so no column or row action is
// hidden behind a sideways swipe. The choice follows the width of the list itself (a container query), not the
// screen, so a list in a narrow column is stacked too.
// `#list` holds the rows for a narrow list: AppListRow items (main value as the title, one status badge on the right,
// the other values in the meta line, the row action at the right). `#table` holds <thead>, <tbody> (and <tfoot>).
// `wide` waits for a wider list before showing the table (a table with long cells). `ruled` draws a line above and
// under the stacked rows (rows inside a padded block, like the receipt).
defineProps<{ wide?: boolean; ruled?: boolean }>();
</script>

<template>
  <div class="@container">
    <ul
      class="divide-y divide-base-300"
      :class="[wide ? '@2xl:hidden' : '@xl:hidden', { 'border-y border-base-300': ruled }]"
    >
      <slot name="list" />
    </ul>
    <div class="hidden" :class="wide ? '@2xl:block' : '@xl:block'">
      <AppTable><slot name="table" /></AppTable>
    </div>
  </div>
</template>
