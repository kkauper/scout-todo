<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check } from '@lucide/vue'
import { useBoardStore } from '../../stores/board'

const model = defineModel<string[]>({ required: true })

const store = useBoardStore()

const open = ref(false)
const errorText = ref<string | null>(null)

const selectedTags = computed(() => model.value.map((id) => store.tagById.get(id)).filter((t): t is NonNullable<typeof t> => !!t))
const existingNames = computed(() => store.tags.map((t) => t.name))

function toggle(id: string) {
  errorText.value = null
  if (model.value.includes(id)) model.value = model.value.filter((t) => t !== id)
  else model.value = [...model.value, id]
}

async function onCreate(name: string) {
  try {
    const tag = await store.createTag(name)
    model.value = [...model.value, tag.id]
  }
  catch (e) {
    const err = e as { statusCode?: number; data?: { statusCode?: number } }
    const statusCode = err?.statusCode ?? err?.data?.statusCode
    errorText.value = statusCode === 409 ? 'Tag already exists' : 'Could not create tag'
  }
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <slot :tags="selectedTags">
        <Button variant="outline" size="sm" aria-label="Tags" class="h-auto min-h-7 flex-wrap justify-start">
          <template v-if="selectedTags.length > 0">
            <ColorBadge v-for="tag in selectedTags" :key="tag.id" :label="tag.name" :color="tag.color" />
          </template>
          <span v-else>Add tags</span>
        </Button>
      </slot>
    </PopoverTrigger>
    <PopoverContent data-no-drag class="p-0 w-60" @click.stop @dblclick.stop @keydown.enter.stop>
      <Command>
        <CommandInput placeholder="Search or create…" />
        <CommandList>
          <CommandGroup>
            <CommandItem v-for="t in store.tags" :key="t.id" :value="t.id" @select="toggle(t.id)">
              <span
                class="size-2 rounded-full"
                :style="{ background: `var(--swatch-${t.color})` }"
                aria-hidden="true"
              />
              {{ t.name }}
              <Check v-if="model.includes(t.id)" class="ml-auto" />
            </CommandItem>
          </CommandGroup>
          <CommandGroup>
            <CommandCreateItem label="tag" :existing="existingNames" @create="onCreate" />
          </CommandGroup>
          <p v-if="errorText" class="px-2 py-1 text-xs text-destructive" role="alert">
            {{ errorText }}
          </p>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
