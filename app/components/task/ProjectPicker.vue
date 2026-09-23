<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Folder } from '@lucide/vue'
import { useBoardStore } from '../../stores/board'

const model = defineModel<string | null>({ required: true })

const store = useBoardStore()

const open = ref(false)
const errorText = ref<string | null>(null)

const selectedProject = computed(() => (model.value ? store.projectById.get(model.value) ?? null : null))
const existingNames = computed(() => store.projects.map((p) => p.name))

function select(id: string | null) {
  model.value = id
  errorText.value = null
  open.value = false
}

async function onCreate(name: string) {
  try {
    const project = await store.createProject(name)
    select(project.id)
  }
  catch (e) {
    const err = e as { statusCode?: number; data?: { statusCode?: number } }
    const statusCode = err?.statusCode ?? err?.data?.statusCode
    errorText.value = statusCode === 409 ? 'Project already exists' : 'Could not create project'
  }
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <slot :project="selectedProject">
        <Button variant="outline" size="sm" aria-label="Project">
          <ProjectBadge
            :label="selectedProject ? selectedProject.name : 'No project'"
            :color="selectedProject ? selectedProject.color : null"
          />
        </Button>
      </slot>
    </PopoverTrigger>
    <PopoverContent data-no-drag class="p-0 w-60" @click.stop @dblclick.stop @keydown.enter.stop>
      <Command>
        <CommandInput placeholder="Search or create…" />
        <CommandList>
          <CommandGroup>
            <CommandItem value="__none" @select="select(null)">
              <Check v-if="model === null" />
              No project
            </CommandItem>
            <CommandItem v-for="p in store.projects" :key="p.id" :value="p.id" @select="select(p.id)">
              <Folder
                class="size-3.5"
                :style="{ color: `var(--swatch-${p.color})` }"
                aria-hidden="true"
              />
              {{ p.name }}
              <Check v-if="model === p.id" class="ml-auto" />
            </CommandItem>
          </CommandGroup>
          <CommandGroup>
            <CommandCreateItem label="project" :existing="existingNames" @create="onCreate" />
          </CommandGroup>
          <p v-if="errorText" class="px-2 py-1 text-xs text-destructive" role="alert">
            {{ errorText }}
          </p>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
