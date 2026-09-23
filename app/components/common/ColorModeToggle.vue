<script setup lang="ts">
import { Monitor, Moon, Sun } from '@lucide/vue'
import { useColorMode } from '@vueuse/core'
import { computed } from 'vue'

const mode = useColorMode({ emitAuto: true })

const Icon = computed(() => {
  if (mode.store.value === 'dark') return Moon
  if (mode.store.value === 'light') return Sun
  return Monitor
})
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" aria-label="Theme">
        <component :is="Icon" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuRadioGroup v-model="mode.store.value">
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
