<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAi } from '../../composables/useAi'

const props = defineProps<{
  title: string
  description?: string | null
  projectName?: string | null
}>()

const emit = defineEmits<{ pick: [title: string] }>()

const { improveTitle } = useAi()

const open = ref(false)
const loading = ref(false)
const errorText = ref<string | null>(null)
const suggestions = ref<string[]>([])

function extractErrorMessage(e: unknown): string {
  const err = e as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
  return err?.data?.statusMessage ?? err?.statusMessage ?? err?.message ?? 'Request failed'
}

async function load() {
  if (!props.title.trim()) return
  loading.value = true
  errorText.value = null
  suggestions.value = []
  try {
    const result = await improveTitle({
      title: props.title,
      description: props.description ?? null,
      projectName: props.projectName ?? null,
    })
    suggestions.value = result.suggestions
  }
  catch (e) {
    errorText.value = extractErrorMessage(e)
  }
  finally {
    loading.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) load()
})

function pick(title: string) {
  emit('pick', title)
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <AiButton label="Improve" :loading="loading" />
    </PopoverTrigger>
    <PopoverContent class="w-72">
      <div v-if="loading" class="text-xs text-muted-foreground">
        Thinking…
      </div>
      <div v-else-if="errorText" class="flex flex-col gap-2">
        <p class="text-xs text-destructive" role="alert">
          {{ errorText }}
        </p>
        <Button variant="ghost" size="sm" @click="load">
          Try again
        </Button>
      </div>
      <div v-else class="flex flex-col gap-1">
        <Button
          v-for="(s, i) in suggestions"
          :key="i"
          variant="ghost"
          size="sm"
          class="justify-start text-left h-auto whitespace-normal py-1.5"
          @click="pick(s)"
        >
          {{ s }}
        </Button>
        <Button variant="ghost" size="sm" @click="load">
          Try again
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
