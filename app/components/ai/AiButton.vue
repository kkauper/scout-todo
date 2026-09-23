<script setup lang="ts">
import { onMounted } from 'vue'
import { Loader2, Sparkles } from '@lucide/vue'
import { useAi } from '../../composables/useAi'

defineProps<{
  label: string
  loading?: boolean
}>()

const emit = defineEmits<{ click: [] }>()

const { status, ready, reason, refreshStatus } = useAi()

onMounted(() => {
  if (status.value === null) refreshStatus()
})
</script>

<template>
  <TooltipProvider v-if="!ready">
    <Tooltip>
      <TooltipTrigger as-child>
        <span tabindex="0" class="inline-flex">
          <Button variant="ghost" size="sm" disabled :aria-busy="loading" @click="emit('click')">
            <Loader2 v-if="loading" class="animate-spin" />
            <Sparkles v-else />
            {{ label }}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {{ reason }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <Button v-else variant="ghost" size="sm" :disabled="loading" :aria-busy="loading" @click="emit('click')">
    <Loader2 v-if="loading" class="animate-spin" />
    <Sparkles v-else />
    {{ label }}
  </Button>
</template>
