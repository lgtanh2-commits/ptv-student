<script setup lang="ts">
// The welcome page for someone not signed in. Written first for teachers looking for a way to run
// their classes; students get their own block near the end, since they join only by invitation.
import { useRouter } from "vue-router";
import GoogleButton from "@/components/GoogleButton.vue";
import LandingPreview from "@/components/LandingPreview.vue";
import { DEMO_VIDEO_URL, youtubeEmbed } from "@/features/landing/demo";
import { messages } from "@/messages";
import AppButton from "@/ui/AppButton.vue";
import AppIcon, { type IconName } from "@/ui/AppIcon.vue";

const t = messages.landing;
const router = useRouter();
const video = youtubeEmbed(DEMO_VIDEO_URL);

const problems: { icon: IconName; problem: string; fix: string }[] = [
  { icon: "message", problem: t.p1Problem, fix: t.p1Fix },
  { icon: "clock", problem: t.p2Problem, fix: t.p2Fix },
  { icon: "invoice", problem: t.p3Problem, fix: t.p3Fix },
  { icon: "attendance", problem: t.p4Problem, fix: t.p4Fix },
];

const features: { icon: IconName; title: string; text: string }[] = [
  { icon: "users", title: t.f1Title, text: t.f1Text },
  { icon: "book", title: t.f2Title, text: t.f2Text },
  { icon: "invoice", title: t.f3Title, text: t.f3Text },
  { icon: "bell", title: t.f4Title, text: t.f4Text },
  { icon: "devices", title: t.f5Title, text: t.f5Text },
  { icon: "archive", title: t.f6Title, text: t.f6Text },
];

const steps = [
  { title: t.s1Title, text: t.s1Text },
  { title: t.s2Title, text: t.s2Text },
  { title: t.s3Title, text: t.s3Text },
  { title: t.s4Title, text: t.s4Text },
];

const studentThings: { icon: IconName; text: string }[] = [
  { icon: "calendar", text: t.st1 },
  { icon: "book", text: t.st2 },
  { icon: "invoice", text: t.st3 },
  { icon: "mobile", text: t.st4 },
];

const faq = [
  { q: t.q1, a: t.a1 },
  { q: t.q2, a: t.a2 },
  { q: t.q3, a: t.a3 },
  { q: t.q4, a: t.a4 },
];
</script>

<template>
  <div>
    <section class="bg-linear-to-b from-primary/10 to-transparent">
      <div
        class="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-12 md:px-8 md:py-20 lg:grid-cols-2 lg:gap-16"
      >
        <div class="flex flex-col items-start">
          <span
            class="inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100 px-3 py-1 text-sm"
          >
            <AppIcon name="spark" :size="16" class="text-primary" />{{ t.badge }}
          </span>
          <h1 class="mt-6 max-w-xl text-4xl text-balance font-semibold tracking-tight md:text-5xl">
            {{ t.title }}
          </h1>
          <p class="mt-4 max-w-xl text-lg text-base-content/70">{{ t.text }}</p>
          <div class="mt-8 grid w-full max-w-md gap-3 sm:grid-cols-2">
            <AppButton @click="router.push('/sign-up')">{{ t.start }}</AppButton>
            <GoogleButton intent="sign-up" />
          </div>
          <p class="mt-4 text-sm text-base-content/70">
            {{ t.haveAccountText }}
            <RouterLink to="/sign-in" class="link font-medium text-primary">{{
              t.haveAccountLink
            }}</RouterLink>
          </p>
        </div>
        <LandingPreview class="w-full max-w-lg lg:justify-self-end" />
      </div>
    </section>

    <section id="problems" class="mx-auto max-w-6xl scroll-mt-4 px-4 py-12 md:px-8">
      <h2 class="text-center text-2xl font-semibold tracking-tight">{{ t.problemsTitle }}</h2>
      <p class="mx-auto mt-2 max-w-2xl text-center text-base-content/70">{{ t.problemsText }}</p>
      <div class="mt-8 grid gap-4 sm:grid-cols-2">
        <article
          v-for="p in problems"
          :key="p.problem"
          class="flex gap-4 rounded-box border border-base-300 bg-base-100 p-5"
        >
          <span class="grid size-11 shrink-0 place-items-center rounded-field bg-primary/10 text-primary">
            <AppIcon :name="p.icon" :size="22" />
          </span>
          <div>
            <h3 class="font-semibold">{{ p.problem }}</h3>
            <p class="mt-1 flex gap-2 text-sm text-base-content/70">
              <AppIcon name="done" :size="18" class="mt-px text-success" />{{ p.fix }}
            </p>
          </div>
        </article>
      </div>
    </section>

    <section id="features" class="mx-auto max-w-6xl scroll-mt-4 px-4 py-12 md:px-8">
      <h2 class="mb-8 text-center text-2xl font-semibold tracking-tight">{{ t.featuresTitle }}</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="f in features"
          :key="f.title"
          class="rounded-box border border-base-300 bg-base-100 p-5"
        >
          <span class="mb-4 grid size-11 place-items-center rounded-field bg-primary/10 text-primary">
            <AppIcon :name="f.icon" :size="22" />
          </span>
          <h3 class="font-semibold">{{ f.title }}</h3>
          <p class="mt-1 text-sm text-base-content/70">{{ f.text }}</p>
        </article>
      </div>
    </section>

    <section id="how" class="mx-auto max-w-6xl scroll-mt-4 px-4 py-12 md:px-8">
      <h2 class="text-center text-2xl font-semibold tracking-tight">{{ t.howTitle }}</h2>
      <p class="mx-auto mt-2 max-w-2xl text-center text-base-content/70">{{ t.howText }}</p>
      <ol class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <li v-for="(s, i) in steps" :key="s.title" class="rounded-box border border-base-300 bg-base-100 p-5">
          <span
            class="mb-4 grid size-11 place-items-center rounded-field bg-primary/10 text-lg font-semibold text-primary"
            >{{ i + 1 }}</span
          >
          <h3 class="font-semibold">{{ s.title }}</h3>
          <p class="mt-1 text-sm text-base-content/70">{{ s.text }}</p>
        </li>
      </ol>
    </section>

    <section v-if="video" id="demo" class="mx-auto max-w-4xl scroll-mt-4 px-4 py-12 md:px-8">
      <h2 class="text-center text-2xl font-semibold tracking-tight">{{ t.demoTitle }}</h2>
      <p class="mx-auto mt-2 max-w-2xl text-center text-base-content/70">{{ t.demoText }}</p>
      <div class="mt-8 aspect-video overflow-hidden rounded-box border border-base-300 bg-base-300">
        <iframe
          :src="video"
          :title="t.demoFrame"
          class="size-full"
          loading="lazy"
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
        />
      </div>
    </section>

    <section id="students" class="mx-auto max-w-6xl scroll-mt-4 px-4 py-12 md:px-8">
      <div class="grid gap-8 rounded-box border border-base-300 bg-base-100 p-6 md:grid-cols-2 md:p-10">
        <div class="flex flex-col items-start gap-3">
          <span class="grid size-11 place-items-center rounded-field bg-primary/10 text-primary">
            <AppIcon name="cap" :size="22" />
          </span>
          <h2 class="text-2xl font-semibold tracking-tight">{{ t.studentsTitle }}</h2>
          <p class="text-base-content/70">{{ t.studentNote }}</p>
          <AppButton variant="secondary" @click="router.push('/sign-in')">{{ t.studentSignIn }}</AppButton>
        </div>
        <div>
          <p class="font-medium">{{ t.studentsText }}</p>
          <ul class="mt-4 flex flex-col gap-3">
            <li v-for="s in studentThings" :key="s.text" class="flex items-center gap-3">
              <span class="grid size-9 shrink-0 place-items-center rounded-field bg-primary/10 text-primary">
                <AppIcon :name="s.icon" :size="18" />
              </span>
              {{ s.text }}
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-3xl px-4 py-12 md:px-8">
      <h2 class="mb-6 text-center text-2xl font-semibold tracking-tight">{{ t.faqTitle }}</h2>
      <div class="flex flex-col gap-3">
        <details
          v-for="f in faq"
          :key="f.q"
          class="collapse-arrow collapse rounded-box border border-base-300 bg-base-100"
        >
          <summary class="collapse-title font-medium">{{ f.q }}</summary>
          <p class="collapse-content text-sm text-base-content/70">{{ f.a }}</p>
        </details>
      </div>
    </section>

    <section class="bg-linear-to-t from-primary/10 to-transparent">
      <div class="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center">
        <h2 class="text-3xl font-semibold tracking-tight">{{ t.ctaTitle }}</h2>
        <p class="text-lg text-base-content/70">{{ t.ctaText }}</p>
        <div class="flex w-full max-w-sm flex-col gap-3">
          <GoogleButton intent="sign-up" />
          <AppButton @click="router.push('/sign-up')">{{ t.start }}</AppButton>
        </div>
      </div>
    </section>
  </div>
</template>
