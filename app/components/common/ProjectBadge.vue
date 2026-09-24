<script setup lang="ts">
import { computed } from 'vue'
import { Folder } from '@lucide/vue'
import type { ColorKey } from '#shared/types/domain'

const props = withDefaults(defineProps<{
  label: string
  color: ColorKey | null
  size?: 'sm' | 'md'
}>(), {
  size: 'sm',
})

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
    class="inline-flex items-center gap-1 font-medium"
    :class="[
      size === 'md'
        ? 'h-7 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem]'
        : 'rounded-md px-2 min-h-5.5 text-xs',
      !color && 'bg-muted text-muted-foreground',
    ]"
    :style="badgeStyle"
  >
    <Folder :class="size === 'md' ? 'size-3.5' : 'size-3'" :style="iconStyle" aria-hidden="true" />
    {{ color ? label : 'No project' }}
  </span>
</template>
