<script setup lang="ts">
const { message } = useLiveAnnouncer()
</script>

<template>
  <NuxtPage />
  <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">{{ message }}</div>
</template>
