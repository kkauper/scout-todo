<script setup lang="ts">
import { ref } from 'vue'

useHead({ title: 'Sign in · Scout' })

const username = ref('')
const password = ref('')
const pending = ref(false)
const error = ref<string | null>(null)

async function onSubmit() {
  pending.value = true
  error.value = null
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { username: username.value, password: password.value },
    })
    await useUserSession().fetch()
    await navigateTo('/')
  }
  catch (e) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err?.data?.statusMessage ?? 'Sign in failed'
    password.value = ''
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-background px-4">
    <Card class="w-full max-w-sm">
      <CardHeader class="flex flex-col items-center gap-2 text-center">
        <ScoutLogo decorative class="h-6 w-auto text-foreground dark:text-brand-lime" />
        <CardTitle class="text-xl">
          Sign in
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
          <div class="flex flex-col gap-1.5">
            <Label for="username">Username</Label>
            <Input
              id="username"
              v-model="username"
              autocomplete="username"
              autofocus
              :disabled="pending"
              :aria-invalid="!!error || undefined"
              :aria-describedby="error ? 'login-error' : undefined"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="password">Password</Label>
            <Input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              :disabled="pending"
              :aria-invalid="!!error || undefined"
              :aria-describedby="error ? 'login-error' : undefined"
            />
          </div>
          <p v-if="error" id="login-error" role="alert" class="text-sm text-destructive">
            {{ error }}
          </p>
          <Button type="submit" class="w-full" :disabled="pending">
            {{ pending ? 'Signing in…' : 'Sign in' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
