<script setup lang="ts">
import { invoiceStatusText, invoiceStatusTone } from "@/components/invoiceLabels";
import { formatVnd } from "@/features/format";
import { periodLabel } from "@/features/invoices/period";
import { useMyInvoices } from "@/features/invoices/useInvoices";
import { usePaging } from "@/features/paging";
import { fill } from "@/features/text";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppBadge from "@/ui/AppBadge.vue";
import AppCard from "@/ui/AppCard.vue";
import AppEmpty from "@/ui/AppEmpty.vue";
import AppListRow from "@/ui/AppListRow.vue";
import AppLoading from "@/ui/AppLoading.vue";
import AppPage from "@/ui/AppPage.vue";
import AppPager from "@/ui/AppPager.vue";

const t = messages.invoices;
const { invoices, unpaid, loading, error } = useMyInvoices();
const paging = usePaging(invoices);
</script>

<template>
  <AppPage :title="t.myTitle" :subtitle="t.myText">
    <AppAlert v-if="error" kind="error">{{ error }}</AppAlert>
    <AppLoading v-if="loading" :label="messages.common.loading" />
    <div v-else-if="invoices.length === 0" class="rounded-box border border-base-300 bg-base-100">
      <AppEmpty icon="invoice" :title="t.myNone" :text="t.myNoneText" />
    </div>
    <template v-else>
      <AppAlert v-if="unpaid.length > 0" kind="warning">{{
        unpaid.length === 1 ? t.myUnpaidOne : fill(t.myUnpaid, { n: unpaid.length })
      }}</AppAlert>
      <AppCard flush>
        <ul class="divide-y divide-base-300">
          <AppListRow v-for="i in paging.shown.value" :key="i.id" :to="`/my/invoices/${i.id}`">
            <template #title>{{ periodLabel(i.period) }}</template>
            <template #meta>
              <p class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="min-w-0 truncate"
                  >{{ i.number }} · {{ fill(t.from2, { name: i.teacherName }) }}</span
                >
                <AppBadge :tone="invoiceStatusTone[i.status]">{{ invoiceStatusText[i.status] }}</AppBadge>
              </p>
            </template>
            <template #trailing>
              <span class="font-semibold whitespace-nowrap">{{ formatVnd(i.total) }}</span>
            </template>
          </AppListRow>
        </ul>
        <AppPager v-model:page="paging.page.value" :pages="paging.pages.value" />
      </AppCard>
    </template>
  </AppPage>
</template>
