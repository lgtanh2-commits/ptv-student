<script setup lang="ts">
import type { MaterialInfo } from "@lms/shared";
import { ref } from "vue";
import { hostOf } from "@/features/format";
import { useMaterials } from "@/features/homework/useHomework";
import { usePaging } from "@/features/paging";
import { fill } from "@/features/text";
import { messages } from "@/messages";
import AppAlert from "@/ui/AppAlert.vue";
import AppBadge from "@/ui/AppBadge.vue";
import AppButton from "@/ui/AppButton.vue";
import AppFormActions from "@/ui/AppFormActions.vue";
import AppCard from "@/ui/AppCard.vue";
import AppCheckbox from "@/ui/AppCheckbox.vue";
import AppConfirm from "@/ui/AppConfirm.vue";
import AppEmpty from "@/ui/AppEmpty.vue";
import AppIcon from "@/ui/AppIcon.vue";
import AppInput from "@/ui/AppInput.vue";
import AppListRow from "@/ui/AppListRow.vue";
import AppLoading from "@/ui/AppLoading.vue";
import AppModal from "@/ui/AppModal.vue";
import AppPager from "@/ui/AppPager.vue";

const props = defineProps<{ courseId: string }>();
const t = messages.links;
const m = useMaterials(props.courseId, { added: t.added, saved: t.saved, removed: t.removed });
const paging = usePaging(m.items);

const asking = ref<MaterialInfo | null>(null);
const removing = ref(false);
async function remove() {
  if (!asking.value) return;
  removing.value = true;
  try {
    await m.remove(asking.value.id);
  } finally {
    removing.value = false;
    asking.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <AppCard :title="t.addTitle" :description="t.intro">
      <form class="grid gap-x-4 gap-y-3 md:grid-cols-2" novalidate @submit.prevent="m.form.submit">
        <AppAlert v-if="m.form.formError.value" kind="error" class="md:col-span-2">{{
          m.form.formError.value
        }}</AppAlert>
        <AppInput v-model="m.form.values.title" :label="t.name" :error="m.form.errors.value.title" />
        <AppInput
          v-model="m.form.values.url"
          :label="t.url"
          type="url"
          placeholder="https://"
          :hint="t.urlHint"
          :error="m.form.errors.value.url"
        />
        <div class="md:col-span-2"><AppCheckbox v-model="m.form.values.published" :label="t.shared" /></div>
        <AppFormActions class="md:col-span-2">
          <AppButton type="submit" :loading="m.form.submitting.value"
            ><AppIcon name="plus" :size="18" />{{ t.add }}</AppButton
          >
        </AppFormActions>
      </form>
    </AppCard>

    <AppCard :title="t.title" flush>
      <AppAlert v-if="m.error.value" kind="error" class="m-5">{{ m.error.value }}</AppAlert>
      <div v-if="m.loading.value" class="p-5"><AppLoading :label="messages.common.loading" :rows="2" /></div>
      <AppEmpty v-else-if="m.items.value.length === 0" compact :title="t.empty" :text="t.emptyText" />
      <ul v-else class="divide-y divide-base-300">
        <AppListRow v-for="l in paging.shown.value" :key="l.id" :href="l.url">
          <template #leading>
            <span class="grid size-10 place-items-center rounded-field bg-base-200 text-base-content/70">
              <AppIcon name="link" :size="18" />
            </span>
          </template>
          <template #title
            ><span class="link link-primary">{{ l.title }}</span></template
          >
          <template #meta
            ><p class="truncate">{{ hostOf(l.url) }}</p></template
          >
          <template #trailing>
            <AppBadge :tone="l.published ? 'success' : 'neutral'">{{
              l.published ? t.visible : t.hidden
            }}</AppBadge>
          </template>
          <template #actions>
            <AppButton variant="ghost" compact @click="m.edit(l)"
              ><AppIcon name="edit" :size="16" />{{ t.edit }}</AppButton
            >
            <AppButton variant="ghost" compact @click="asking = l"
              ><AppIcon name="trash" :size="16" />{{ t.remove }}</AppButton
            >
          </template>
        </AppListRow>
      </ul>
      <AppPager v-model:page="paging.page.value" :pages="paging.pages.value" />
    </AppCard>

    <AppModal
      :model-value="m.editing.value !== null"
      :title="t.editTitle"
      :close-label="messages.common.close"
      @update:model-value="(v) => !v && (m.editing.value = null)"
    >
      <form id="edit-link" class="flex flex-col gap-3" novalidate @submit.prevent="m.editForm.submit">
        <AppAlert v-if="m.editForm.formError.value" kind="error">{{ m.editForm.formError.value }}</AppAlert>
        <AppInput v-model="m.editForm.values.title" :label="t.name" :error="m.editForm.errors.value.title" />
        <AppInput
          v-model="m.editForm.values.url"
          :label="t.url"
          type="url"
          placeholder="https://"
          :hint="t.urlHint"
          :error="m.editForm.errors.value.url"
        />
        <AppCheckbox v-model="m.editForm.values.published" :label="t.shared" />
      </form>
      <template #actions>
        <AppButton variant="ghost" @click="m.editing.value = null">{{ messages.common.cancel }}</AppButton>
        <AppButton type="submit" form="edit-link" :loading="m.editForm.submitting.value">{{
          t.save
        }}</AppButton>
      </template>
    </AppModal>

    <AppConfirm
      :model-value="asking !== null"
      :title="t.removeTitle"
      :text="fill(t.removeText, { title: asking?.title ?? '' })"
      :confirm-label="t.remove"
      :loading="removing"
      @update:model-value="(v) => !v && (asking = null)"
      @confirm="remove"
    />
  </div>
</template>
