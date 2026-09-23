<script setup lang="ts">
import { CircleUser, KeyRound, LogOut, Monitor, Moon, Sparkles, Sun } from '@lucide/vue'
import { useColorMode } from '@vueuse/core'
import { ref } from 'vue'

const { user, clear } = useUserSession()
const { store } = useColorMode({ emitAuto: true })

const passwordOpen = ref(false)
const aiSettingsOpen = ref(false)

async function onSignOut() {
  await clear()
  reloadNuxtApp({ path: '/login' })
}
</script>

<template>
  <div class="contents">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="icon" class="shrink-0" aria-label="Account">
          <CircleUser />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-56">
        <DropdownMenuLabel class="font-normal text-muted-foreground truncate">
          {{ user?.name ?? 'Signed in' }}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup v-model="store">
          <DropdownMenuRadioItem value="light">
            <Sun />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="auto">
            <Monitor />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="aiSettingsOpen = true">
          <Sparkles />
          AI settings
        </DropdownMenuItem>
        <DropdownMenuItem @select="passwordOpen = true">
          <KeyRound />
          Change password
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem @click="onSignOut">
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <ChangePasswordDialog v-model:open="passwordOpen" />
    <AiSettingsDialog v-model:open="aiSettingsOpen" />
  </div>
</template>
