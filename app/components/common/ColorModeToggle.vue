<script setup lang="ts">
import { Monitor, Moon, Sun } from '@lucide/vue'
import { useColorMode } from '@vueuse/core'
import { computed } from 'vue'

const { store } = useColorMode({ emitAuto: true })

const Icon = computed(() => {
  if (store.value === 'dark') return Moon
  if (store.value === 'light') return Sun
  return Monitor
})

const label = computed(() => {
  if (store.value === 'dark') return 'Dark'
  if (store.value === 'light') return 'Light'
  return 'System'
})
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" :aria-label="`Theme: ${label}`">
        <component :is="Icon" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
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
    </DropdownMenuContent>
  </DropdownMenu>
</template>
