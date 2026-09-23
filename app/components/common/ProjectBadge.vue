<script setup lang="ts">
import { computed } from 'vue'
import { Folder } from '@lucide/vue'
import type { ColorKey } from '#shared/types/domain'

const props = defineProps<{
  label: string
  color: ColorKey | null
}>()

const badgeStyle = computed(() => {
  if (!props.color) return {}
  return {
    background: `color-mix(in oklch, var(--swatch-${props.color}) 22%, transparent)`,
    color: 'var(--foreground)',
    boxShadow: `inset 0 0 0 1px color-mix(in oklch, var(--swatch-${props.color}) 45%, transparent)`,
  }
})

const iconStyle = computed(() => (props.color ? { color: `var(--swatch-${props.color})` } : {}))
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-md px-2 h-5.5 text-xs font-medium"
    :class="!color && 'bg-muted text-muted-foreground'"
    :style="badgeStyle"
  >
    <Folder class="size-3" :style="iconStyle" aria-hidden="true" />
    {{ color ? label : 'No project' }}
  </span>
</template>
