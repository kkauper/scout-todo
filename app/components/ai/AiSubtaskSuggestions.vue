<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAi } from '../../composables/useAi'

const props = defineProps<{
  title: string
  description?: string | null
}>()

const emit = defineEmits<{ add: [titles: string[]] }>()

const { suggestSubtasks } = useAi()
const { announce } = useLiveAnnouncer()

const loading = ref(false)
const errorText = ref<string | null>(null)
const items = ref<string[]>([])
const checked = ref<boolean[]>([])

function extractErrorMessage(e: unknown): string {
  const err = e as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
  return err?.data?.statusMessage ?? err?.statusMessage ?? err?.message ?? 'Request failed'
}

async function run() {
  loading.value = true
  errorText.value = null
  items.value = []
  checked.value = []
  announce('Generating suggestions…')
  try {
    const result = await suggestSubtasks({
      title: props.title,
      description: props.description ?? null,
    })
    items.value = result.items
    checked.value = result.items.map(() => true)
    announce(`${result.items.length} suggestions ready`)
  }
  catch (e) {
    errorText.value = extractErrorMessage(e)
  }
  finally {
    loading.value = false
  }
}

const selectedCount = computed(() => checked.value.filter(Boolean).length)

function addSelected() {
  const titles = items.value.filter((_, i) => checked.value[i])
  emit('add', titles)
  discard()
}

function discard() {
  items.value = []
  checked.value = []
  errorText.value = null
}

defineExpose({ run, loading })
</script>

<template>
  <div v-if="errorText || items.length" class="flex flex-col gap-2">
    <p v-if="errorText" class="text-xs text-destructive" role="alert">
      {{ errorText }}
    </p>

    <div v-if="items.length" class="flex flex-col gap-2">
      <ul class="flex flex-col gap-1.5">
        <li v-for="(item, i) in items" :key="i" class="flex items-start gap-2">
          <Checkbox
            :id="`ai-subtask-${i}`"
            :model-value="checked[i] ?? true"
            class="mt-0.5"
            @update:model-value="(v) => { checked[i] = v === true }"
          />
          <Label :for="`ai-subtask-${i}`" class="text-sm font-normal leading-snug">
            {{ item }}
          </Label>
        </li>
      </ul>
      <div class="flex gap-2">
        <Button variant="secondary" size="sm" :disabled="selectedCount === 0" @click="addSelected">
          Add selected
        </Button>
        <Button variant="ghost" size="sm" @click="discard">
          Discard
        </Button>
      </div>
    </div>
  </div>
</template>
