<script setup lang="ts">
import { computed, watch } from 'vue'
import { Plus } from '@lucide/vue'
import { useCommand, useCommandGroup } from '@/components/ui/command'

const props = defineProps<{
  label: string
  existing: string[]
}>()

const emit = defineEmits<{
  create: [name: string]
}>()

const { filterState } = useCommand()
const groupContext = useCommandGroup()

const term = computed(() => filterState.search.trim())
const show = computed(() => term.value !== '' && !props.existing.some((n) => n.toLowerCase() === term.value.toLowerCase()))

// The item registers its searchable text with the Command root only on mount (see
// `:key="term"` below forcing a remount per term). CommandGroup's own visibility is
// computed from that registration *before* this item's mount runs in the same reactive
// tick, so a freshly-shown item would otherwise sit inside a `hidden` group for a tick
// that never gets re-evaluated. This dedicated group only ever holds this one item, so
// its visibility can just mirror `show` directly.
watch(show, (visible) => {
  const groupId = groupContext?.id
  if (!groupId) return
  if (visible) filterState.filtered.groups.add(groupId)
  else filterState.filtered.groups.delete(groupId)
}, { immediate: true })
</script>

<template>
  <CommandItem
    v-if="show"
    :key="term"
    :value="`__create__${term}`"
    @select="emit('create', term)"
  >
    <Plus />
    Create {{ label }} “{{ term }}”
  </CommandItem>
</template>
