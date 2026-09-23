<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: number | string
    hint?: string
    tone?: 'default' | 'destructive'
  }>(),
  { tone: 'default' },
)
</script>

<template>
  <Card class="gap-1 py-3">
    <CardContent class="px-3">
      <div class="text-xs text-muted-foreground">
        {{ label }}
      </div>
      <div
        class="text-2xl font-semibold tabular-nums"
        :class="{ 'text-destructive': tone === 'destructive' && value !== 0 }"
      >
        {{ value }}
      </div>
      <div v-if="hint" class="text-xs text-muted-foreground">
        {{ hint }}
      </div>
    </CardContent>
  </Card>
</template>
