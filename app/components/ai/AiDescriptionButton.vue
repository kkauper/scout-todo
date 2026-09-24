<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAi } from '../../composables/useAi'

const props = defineProps<{
  title: string
  projectName?: string | null
  tags?: string[]
  existing?: string | null
}>()

const emit = defineEmits<{ result: [text: string] }>()

const { draftDescription } = useAi()
const { announce } = useLiveAnnouncer()

const loading = ref(false)
const errorText = ref<string | null>(null)

const label = computed(() => (props.existing ? 'Improve with AI' : 'Draft with AI'))

function extractErrorMessage(e: unknown): string {
  const err = e as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
  return err?.data?.statusMessage ?? err?.statusMessage ?? err?.message ?? 'Request failed'
}

async function run() {
  loading.value = true
  errorText.value = null
  announce('Generating suggestions…')
  try {
    const result = await draftDescription({
      title: props.title,
      projectName: props.projectName ?? null,
      tags: props.tags ?? [],
      existing: props.existing ?? null,
    })
    emit('result', result.text)
    announce('Description drafted')
  }
  catch (e) {
    errorText.value = extractErrorMessage(e)
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <AiButton :label="label" :loading="loading" @click="run" />
    <p v-if="errorText" class="text-xs text-destructive" role="alert">
      {{ errorText }}
    </p>
  </div>
</template>
