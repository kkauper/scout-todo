<script setup lang="ts">
import type { ColorKey } from '#shared/types/domain'

defineProps<{
  label: string
  color: ColorKey | null
}>()
</script>

<template>
  <Badge variant="outline" class="gap-1.5 font-normal">
    <span
      class="size-2 rounded-full"
      :style="{ background: color ? `var(--swatch-${color})` : 'var(--muted-foreground)' }"
      aria-hidden="true"
    />
    {{ label }}
  </Badge>
</template>
