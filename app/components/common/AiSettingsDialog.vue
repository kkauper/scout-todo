<script setup lang="ts">
import { ref, watch } from 'vue'

interface AiSettingsResponse {
  claudeKeyConfigured: boolean
  claudeKeyHint: string | null
  encryptionConfigured: boolean
}

const open = defineModel<boolean>('open', { required: true })

const { refreshStatus } = useAi()

const settings = ref<AiSettingsResponse | null>(null)
const apiKey = ref('')
const pending = ref(false)
const error = ref<string | null>(null)

async function loadSettings() {
  try {
    settings.value = await $fetch<AiSettingsResponse>('/api/settings/ai')
  }
  catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err?.data?.statusMessage ?? 'Could not load AI settings'
  }
}

watch(open, (isOpen) => {
  if (!isOpen) return
  apiKey.value = ''
  error.value = null
  void loadSettings()
})

async function onSave() {
  error.value = null
  pending.value = true
  try {
    settings.value = await $fetch<AiSettingsResponse>('/api/settings/ai', {
      method: 'PUT',
      body: { anthropicApiKey: apiKey.value },
    })
    apiKey.value = ''
    await refreshStatus()
  }
  catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err?.data?.statusMessage ?? 'Could not save the API key'
  }
  finally {
    pending.value = false
  }
}

async function onRemove() {
  error.value = null
  pending.value = true
  try {
    settings.value = await $fetch<AiSettingsResponse>('/api/settings/ai', { method: 'DELETE' })
    await refreshStatus()
  }
  catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err?.data?.statusMessage ?? 'Could not remove the API key'
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>AI settings</DialogTitle>
        <DialogDescription class="sr-only">
          Configure your personal Claude API key
        </DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="onSave">
        <p class="text-sm text-muted-foreground">
          <template v-if="settings?.claudeKeyConfigured">
            Using Claude ({{ CLAUDE_MODEL }}) — key {{ settings.claudeKeyHint }}
          </template>
          <template v-else>
            No Claude key — using local AI (Ollama) when available
          </template>
        </p>
        <div class="flex flex-col gap-1.5">
          <Label for="anthropic-api-key">Anthropic API key</Label>
          <Input
            id="anthropic-api-key"
            v-model="apiKey"
            type="password"
            autocomplete="off"
            placeholder="sk-ant-…"
            :disabled="pending"
          />
          <p class="text-xs text-muted-foreground">
            Stored encrypted on the server and only used for your requests. Create a key at console.anthropic.com.
          </p>
        </div>
        <p v-if="error" role="alert" class="text-sm text-destructive">
          {{ error }}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="pending" @click="open = false">
            Close
          </Button>
          <Button
            v-if="settings?.claudeKeyConfigured"
            type="button"
            variant="outline"
            :disabled="pending"
            @click="onRemove"
          >
            Remove key
          </Button>
          <Button type="submit" :disabled="pending || !apiKey">
            {{ pending ? 'Verifying…' : 'Save key' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
