interface TaskDialogState {
  open: boolean
  columnId: string | null
  title: string
}

export function useTaskDialog() {
  const dialog = useState<TaskDialogState>('taskDialog', () => ({
    open: false,
    columnId: null,
    title: '',
  }))

  function openCreate(columnId: string | null = null, title = '') {
    dialog.value = { open: true, columnId, title }
  }

  function close() {
    dialog.value.open = false
  }

  return { dialog, openCreate, close }
}
