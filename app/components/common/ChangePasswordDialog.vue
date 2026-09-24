<script setup lang="ts">
import { ref, watch } from 'vue'

const open = defineModel<boolean>('open', { required: true })

const currentPassword = ref('')
const newPassword = ref('')
const repeatPassword = ref('')
const pending = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  currentPassword.value = ''
  newPassword.value = ''
  repeatPassword.value = ''
  error.value = null
  success.value = null
})

async function onSubmit() {
  error.value = null
  success.value = null

  if (newPassword.value.length < 12) {
    error.value = 'New password must be at least 12 characters'
    return
  }
  if (newPassword.value !== repeatPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  pending.value = true
  try {
    await $fetch('/api/auth/password', {
      method: 'POST',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value },
    })
    success.value = 'Password changed'
    setTimeout(() => { open.value = false }, 1200)
  }
  catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err?.data?.statusMessage ?? 'Could not change password'
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
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription class="sr-only">
          Change your account password
        </DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
        <div class="flex flex-col gap-1.5">
          <Label for="current-password">Current password</Label>
          <Input
            id="current-password"
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            autofocus
            :disabled="pending"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="new-password">New password</Label>
          <Input
            id="new-password"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            :disabled="pending"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="repeat-password">Repeat new password</Label>
          <Input
            id="repeat-password"
            v-model="repeatPassword"
            type="password"
            autocomplete="new-password"
            :disabled="pending"
          />
        </div>
        <p v-if="error" role="alert" class="text-sm text-destructive">
          {{ error }}
        </p>
        <p v-if="success" class="text-sm text-muted-foreground">
          {{ success }}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" :disabled="pending" @click="open = false">
            Cancel
          </Button>
          <Button type="submit" :disabled="pending">
            {{ pending ? 'Saving…' : 'Change password' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
