export function useTaskPanel() {
  const taskId = useState<string | null>('taskPanel', () => null)

  function openTask(id: string) {
    taskId.value = id
  }

  function closeTask() {
    taskId.value = null
  }

  return { taskId, openTask, closeTask }
}
