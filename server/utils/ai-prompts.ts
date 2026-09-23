interface Prompt {
  system: string
  user: string
}

export function improveTitlePrompt(input: { title: string; description?: string | null; projectName?: string | null }): Prompt {
  const system = [
    'You help write concise, actionable Kanban task titles.',
    'Suggest exactly 3 alternative titles for the given task.',
    'Rules: each title must be concise (max 70 characters), start with a verb, be specific, have no trailing period, and no surrounding quotes.',
    'Answer in the same language as the input.',
    'Never invent facts, metrics, or scope not present in the input.',
  ].join(' ')

  const lines = [`Title: ${input.title}`]
  if (input.description) lines.push(`Description: ${input.description}`)
  if (input.projectName) lines.push(`Project: ${input.projectName}`)

  return { system, user: lines.join('\n') }
}

export function draftDescriptionPrompt(input: { title: string; projectName?: string | null; tags?: string[]; existing?: string | null }): Prompt {
  const system = [
    'You help write short Kanban task descriptions.',
    'Write 2-5 sentences or a short bullet list covering: goal, scope, and done-criteria.',
    'If an existing description is given, improve it while keeping its facts.',
    'Output plain text or Markdown only: no heading, no preamble like "Here is", no closing remarks.',
    'Answer in the same language as the input.',
    'Never invent facts, metrics, or scope not present in the input.',
  ].join(' ')

  const lines = [`Title: ${input.title}`]
  if (input.projectName) lines.push(`Project: ${input.projectName}`)
  if (input.tags?.length) lines.push(`Tags: ${input.tags.join(', ')}`)
  if (input.existing) lines.push(`Existing description:\n${input.existing}`)

  return { system, user: lines.join('\n') }
}

export function subtasksPrompt(input: { title: string; description?: string | null }): Prompt {
  const system = [
    'You break down a Kanban task into concrete, actionable sub-todos.',
    'Suggest 3-7 sub-todos, each at most 80 characters, starting with a verb, ordered by execution order.',
    'Do not number the items.',
    'Answer in the same language as the input.',
    'Never invent facts, metrics, or scope not present in the input.',
  ].join(' ')

  const lines = [`Title: ${input.title}`]
  if (input.description) lines.push(`Description: ${input.description}`)

  return { system, user: lines.join('\n') }
}

export function achievementPrompt(input: {
  periodLabel: string
  scopeName: string
  tasks: { title: string; project: string | null; tags: string[]; description: string | null; cycleDays: number; completedAt: string }[]
}): Prompt {
  const system = [
    'You write achievement summaries for a manager or salary conversation, in Markdown.',
    'Structure: a short intro line stating the period and task count, then bullets grouped by project under a "**Project**" sub-heading line (unassigned tasks under "**No project**").',
    'Each bullet describes outcome/impact in active voice with implied first person, no fluff. Closely related tasks may be merged into one bullet.',
    'End with a short closing line stating delivery facts (task count, average cycle time) — use ONLY the numbers given in the input.',
    'Never invent numbers, percentages, stakeholders, or facts that are not present in the input data.',
    'Answer in the same language as the task titles/descriptions given.',
  ].join(' ')

  const count = input.tasks.length
  const avgCycleDays = count > 0
    ? Math.round((input.tasks.reduce((sum, t) => sum + t.cycleDays, 0) / count) * 10) / 10
    : 0

  const lines = [
    `Period: ${input.periodLabel}`,
    `Scope: ${input.scopeName}`,
    `Task count: ${count}`,
    `Average cycle time: ${avgCycleDays} days`,
    '',
    'Tasks (JSON):',
    JSON.stringify(input.tasks),
  ]

  return { system, user: lines.join('\n') }
}
