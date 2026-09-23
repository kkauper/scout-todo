interface TaskDialogState {
  open: boolean
  mode: 'create' | 'edit'
  taskId: string | null
  columnId: string | null
  title: string
}

export function useTaskDialog() {
  const dialog = useState<TaskDialogState>('taskDialog', () => ({
    open: false,
    mode: 'create',
    taskId: null,
    columnId: null,
    title: '',
  }))

  function openCreate(columnId: string | null = null, title = '') {
    dialog.value = { open: true, mode: 'create', taskId: null, columnId, title }
  }

  function openEdit(taskId: string) {
    dialog.value = { open: true, mode: 'edit', taskId, columnId: dialog.value.columnId, title: '' }
  }

  function close() {
    dialog.value.open = false
  }

  return { dialog, openCreate, openEdit, close }
}
