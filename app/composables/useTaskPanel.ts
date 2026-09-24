export function useTaskPanel() {
  const taskId = useState<string | null>('taskPanel', () => null)
  const route = useRoute()
  const router = useRouter()

  function openTask(id: string) {
    taskId.value = id
    router.replace({ query: { ...route.query, task: id } })
  }

  function closeTask() {
    taskId.value = null
    if (route.query.task === undefined) return
    const query = { ...route.query }
    delete query.task
    router.replace({ query })
  }

  return { taskId, openTask, closeTask }
}
