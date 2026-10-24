<script setup lang="ts">
import LandingPage from "@/components/LandingPage.vue";
import StudentDashboard from "@/components/StudentDashboard.vue";
import TeacherDashboard from "@/components/TeacherDashboard.vue";
import { useSession } from "@/features/auth/session";

const session = useSession();
</script>

<template>
  <TeacherDashboard v-if="session.me && session.isTeacher" />

  <StudentDashboard v-else-if="session.me" />

  <LandingPage v-else />
</template>
