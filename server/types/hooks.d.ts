import type { ColumnKind } from '#shared/types/domain'

export interface TaskMovedPayload {
  taskId: string
  fromColumnId: string
  toColumnId: string
  toKind: ColumnKind
  at: string
}

// NOTE: augmenting NitroRuntimeHooks (tried both 'nitropack/types' and 'nitropack')
// resolves fine standalone (`vue-tsc -p .nuxt/tsconfig.server.json`) but is not picked
// up by `nuxi typecheck` (`vue-tsc -b --noEmit`, TS project-references build mode) in
// this Nuxt 4.5 / nitropack 2.13 combination. Dropped per plan fallback; call sites cast
// `useNitroApp().hooks` to `any` for the custom hook name instead.

export {}
