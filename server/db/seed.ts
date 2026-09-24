import 'dotenv/config'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { DEFAULT_COLUMNS } from '../../shared/types/domain'
import { localDateIso } from '../../shared/utils/dates'
import * as schema from './schema'

const OWNER_ID = '00000000-0000-4000-8000-000000000001'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const client = postgres(url, { max: 1 })
const db = drizzle(client, { schema })

const DAY = 86_400_000

// Indices into DEFAULT_COLUMNS: 0 Backlog, 1 To do, 2 In progress, 3 Review, 4 Done.
const DONE_COLUMN_IDX = 4

function makeRng(seed: number) {
  let s = seed >>> 0
  return function rng(): number {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const rng = makeRng(20240601)

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

function randFloat(min: number, max: number): number {
  return rng() * (max - min) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)] as T
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i)
    const tmp = a[i] as T
    a[i] = a[j] as T
    a[j] = tmp
  }
  return a
}

const PROJECTS = [
  { name: 'Platform', color: 'blue' as const },
  { name: 'Design System', color: 'violet' as const },
  { name: 'Hiring', color: 'amber' as const },
  { name: 'Ops', color: 'teal' as const },
]

const TAGS = [
  { name: 'bug', color: 'red' as const },
  { name: 'feature', color: 'green' as const },
  { name: 'meeting', color: 'slate' as const },
  { name: 'docs', color: 'teal' as const },
  { name: 'urgent', color: 'orange' as const },
]

const TITLE_POOL = [
  'Fix login redirect loop',
  'Design new onboarding flow',
  'Set up CI pipeline for staging',
  'Write API docs for tasks endpoint',
  'Interview candidate for backend role',
  'Migrate database to Postgres 17',
  'Refactor board drag-and-drop',
  'Add dark mode support',
  'Investigate memory leak in worker',
  'Plan Q3 roadmap',
  'Update dependency versions',
  'Design empty states for board',
  'Write onboarding checklist',
  'Fix flaky e2e test',
  'Improve KPI panel performance',
  'Draft job posting for designer',
  'Review pull request backlog',
  'Set up error tracking',
  'Create color token documentation',
  'Fix overdue badge alignment',
  'Add keyboard shortcuts',
  'Prepare all-hands presentation',
  'Audit accessibility of dialogs',
  'Optimize task list query',
  'Design tag picker component',
  'Write postmortem for outage',
  'Set up automated backups',
  'Sync with design on new icons',
  'Clean up unused Tailwind classes',
  'Plan hiring pipeline for Q4',
]

interface PlannedTask {
  title: string
  finalColumnIdx: number
  projectId: string | null
  deadline: string | null
  createdAt: Date
  events: { fromColumnIdx: number | null; toColumnIdx: number; changedAt: Date }[]
  completedAt: Date | null
  stateChangedAt: Date
  tagIds: string[]
}

async function main() {
  const [ownerRow] = await db.select().from(schema.users).where(eq(schema.users.id, OWNER_ID))
  const ownerId = ownerRow
    ? ownerRow.id
    : (await db.insert(schema.users).values({ id: OWNER_ID, username: 'owner', passwordHash: null }).returning())[0]!.id

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.tasks)
    .where(eq(schema.tasks.userId, ownerId))
  const existingTaskCount = countRows[0]?.count ?? 0
  const reset = process.argv.includes('--reset')

  if (existingTaskCount > 0 && !reset) {
    console.error(`Database already has ${existingTaskCount} task(s). Run "pnpm db:seed -- --reset" to wipe and reseed.`)
    await client.end()
    process.exit(1)
  }

  if (reset) {
    await db.delete(schema.tasks).where(eq(schema.tasks.userId, ownerId))
  }
  // No tasks left at this point. Migrations already created default columns for the owner,
  // so clear them (and any leftover projects/tags) instead of seeding a second set.
  await db.delete(schema.boardColumns).where(eq(schema.boardColumns.userId, ownerId))
  await db.delete(schema.tags).where(eq(schema.tags.userId, ownerId))
  await db.delete(schema.projects).where(eq(schema.projects.userId, ownerId))

  const projectRows = await db.insert(schema.projects).values(PROJECTS.map(p => ({ ...p, userId: ownerId }))).returning()
  const tagRows = await db.insert(schema.tags).values(TAGS.map(t => ({ ...t, userId: ownerId }))).returning()

  const columnRows = await db
    .insert(schema.boardColumns)
    .values(DEFAULT_COLUMNS.map((c, i) => ({ userId: ownerId, name: c.name, kind: c.kind, position: (i + 1) * 1000 })))
    .returning()
  const columnByName = new Map(columnRows.map(c => [c.name, c]))
  const columnsInOrder = DEFAULT_COLUMNS.map((c) => {
    const row = columnByName.get(c.name)
    if (!row) throw new Error(`Missing column row for "${c.name}"`)
    return row
  })

  const now = new Date()

  // Column idx → task count, matching the previous per-state distribution.
  const finalColumnCounts: [number, number][] = [
    [DONE_COLUMN_IDX, 12], // Done
    [2, 5], // In progress
    [3, 3], // Review
    [1, 5], // To do
    [0, 5], // Backlog
  ]

  const finalColumnIdxs: number[] = []
  for (const [idx, count] of finalColumnCounts) {
    for (let i = 0; i < count; i++) finalColumnIdxs.push(idx)
  }
  const orderedFinalIdxs = shuffle(finalColumnIdxs)
  const titles = shuffle(TITLE_POOL).slice(0, orderedFinalIdxs.length)

  const allIndices = orderedFinalIdxs.map((_, i) => i)
  const unassignedIdx = new Set(shuffle(allIndices).slice(0, 3))

  const openIndices = orderedFinalIdxs
    .map((s, i) => ({ s, i }))
    .filter(x => x.s === 0 || x.s === 1)
    .map(x => x.i)
  const pastDeadlineIdx = new Set(shuffle(openIndices).slice(0, 3))

  const remainingForFuture = allIndices.filter(i => !pastDeadlineIdx.has(i))
  const futureDeadlineIdx = new Set(shuffle(remainingForFuture).slice(0, 6))

  const planned: PlannedTask[] = []

  for (let i = 0; i < orderedFinalIdxs.length; i++) {
    const finalIdx = orderedFinalIdxs[i] as number
    const title = titles[i] as string
    const projectId = unassignedIdx.has(i) ? null : pick(projectRows).id
    const path = Array.from({ length: finalIdx + 1 }, (_, k) => k)

    let createdAt: Date
    let stateChangedAt: Date
    let completedAt: Date | null = null
    const events: { fromColumnIdx: number | null; toColumnIdx: number; changedAt: Date }[] = []

    if (finalIdx === DONE_COLUMN_IDX) {
      const daysAgoCompleted = randFloat(0, 56)
      const completed = new Date(now.getTime() - daysAgoCompleted * DAY)
      const createdDaysBefore = randFloat(1, 14)
      createdAt = new Date(completed.getTime() - createdDaysBefore * DAY)
      completedAt = completed
      stateChangedAt = completed

      let prevTime = createdAt.getTime()
      for (let s = 0; s < path.length; s++) {
        const isLast = s === path.length - 1
        let changedAt: Date
        if (s === 0) {
          changedAt = createdAt
        }
        else if (isLast) {
          changedAt = completed
        }
        else {
          const frac = s / (path.length - 1)
          changedAt = new Date(createdAt.getTime() + (completed.getTime() - createdAt.getTime()) * frac)
        }
        if (changedAt.getTime() < prevTime) changedAt = new Date(prevTime + 1000)
        events.push({ fromColumnIdx: s === 0 ? null : (path[s - 1] as number), toColumnIdx: path[s] as number, changedAt })
        prevTime = changedAt.getTime()
      }
    }
    else {
      const daysAgoCreated = randFloat(2, 45)
      createdAt = new Date(now.getTime() - daysAgoCreated * DAY)
      const changeFrac = path.length === 1 ? 0 : randFloat(0.3, 0.95)

      let prevTime = createdAt.getTime()
      for (let s = 0; s < path.length; s++) {
        const isLast = s === path.length - 1
        let changedAt: Date
        if (s === 0) {
          changedAt = createdAt
        }
        else if (isLast) {
          changedAt = new Date(createdAt.getTime() + (now.getTime() - createdAt.getTime()) * changeFrac)
        }
        else {
          const frac = (s / (path.length - 1)) * changeFrac
          changedAt = new Date(createdAt.getTime() + (now.getTime() - createdAt.getTime()) * frac)
        }
        if (changedAt.getTime() < prevTime) changedAt = new Date(prevTime + 1000)
        events.push({ fromColumnIdx: s === 0 ? null : (path[s - 1] as number), toColumnIdx: path[s] as number, changedAt })
        prevTime = changedAt.getTime()
      }
      stateChangedAt = (events[events.length - 1] as (typeof events)[number]).changedAt
    }

    let deadline: string | null = null
    if (pastDeadlineIdx.has(i)) {
      deadline = localDateIso(new Date(now.getTime() - randInt(1, 20) * DAY))
    }
    else if (futureDeadlineIdx.has(i)) {
      deadline = localDateIso(new Date(now.getTime() + randInt(1, 30) * DAY))
    }

    const tagCount = rng() < 0.15 ? 0 : randInt(1, 2)
    const tagIds = shuffle(tagRows.map(t => t.id)).slice(0, tagCount)

    planned.push({ title, finalColumnIdx: finalIdx, projectId, deadline, createdAt, events, completedAt, stateChangedAt, tagIds })
  }

  const positionCounters: number[] = [0, 0, 0, 0, 0]

  let eventCount = 0
  let taskTagCount = 0
  const insertedTasks: { id: string; finalColumnIdx: number; createdAt: Date; completedAt: Date | null }[] = []

  for (const p of planned) {
    const counter = (positionCounters[p.finalColumnIdx] ?? 0) + 1000
    positionCounters[p.finalColumnIdx] = counter

    const columnRow = columnsInOrder[p.finalColumnIdx]
    if (!columnRow) throw new Error(`Missing column row for index ${p.finalColumnIdx}`)

    const [taskRow] = await db
      .insert(schema.tasks)
      .values({
        userId: ownerId,
        title: p.title,
        projectId: p.projectId,
        columnId: columnRow.id,
        position: counter,
        deadline: p.deadline,
        createdAt: p.createdAt,
        updatedAt: p.stateChangedAt,
        stateChangedAt: p.stateChangedAt,
        completedAt: p.completedAt,
      })
      .returning()
    if (!taskRow) throw new Error('Insert failed')

    if (p.tagIds.length > 0) {
      await db.insert(schema.taskTags).values(p.tagIds.map(tagId => ({ taskId: taskRow.id, tagId })))
      taskTagCount += p.tagIds.length
    }

    await db.insert(schema.taskStateEvents).values(
      p.events.map((e) => {
        const toColumn = columnsInOrder[e.toColumnIdx]
        if (!toColumn) throw new Error(`Missing column row for index ${e.toColumnIdx}`)
        const fromColumn = e.fromColumnIdx !== null ? columnsInOrder[e.fromColumnIdx] : undefined
        return {
          taskId: taskRow.id,
          fromColumnId: fromColumn ? fromColumn.id : null,
          toColumnId: toColumn.id,
          toKind: toColumn.kind,
          changedAt: e.changedAt,
        }
      }),
    )
    eventCount += p.events.length

    insertedTasks.push({ id: taskRow.id, finalColumnIdx: p.finalColumnIdx, createdAt: p.createdAt, completedAt: p.completedAt })
  }

  const CHECKLIST_TITLE_POOL = [
    'Draft outline',
    'Get feedback',
    'Update tests',
    'Write summary',
    'Follow up with team',
    'Review changes',
    'Add documentation',
    'Verify fix',
    'Prepare demo',
    'Clean up notes',
    'Double-check edge cases',
    'Ping stakeholders',
  ]

  // Guarantee at least 3 open/active tasks get a checklist with a mix of done and undone items,
  // so the card checklist progress indicator is visible on the board without relying on chance.
  const openActiveTaskIdx = insertedTasks
    .map((t, i) => ({ t, i }))
    .filter(x => x.t.finalColumnIdx !== DONE_COLUMN_IDX)
    .map(x => x.i)
  const guaranteedMixedIdx = shuffle(openActiveTaskIdx).slice(0, Math.min(3, openActiveTaskIdx.length))
  const remainingPool = insertedTasks.map((_, i) => i).filter(i => !guaranteedMixedIdx.includes(i))
  const extraChecklistIdx = shuffle(remainingPool).slice(0, Math.max(0, 8 - guaranteedMixedIdx.length))
  const checklistTaskIdx = [...guaranteedMixedIdx, ...extraChecklistIdx]

  let checklistItemCount = 0

  for (const idx of checklistTaskIdx) {
    const task = insertedTasks[idx] as (typeof insertedTasks)[number]
    const isDoneTask = task.finalColumnIdx === DONE_COLUMN_IDX
    const isGuaranteedMixed = guaranteedMixedIdx.includes(idx)
    const itemCount = randInt(isGuaranteedMixed ? 3 : 2, 5)
    const titles = shuffle(CHECKLIST_TITLE_POOL).slice(0, itemCount)

    const values = titles.map((title, i) => {
      let done: boolean
      if (isDoneTask) {
        done = true
      }
      else if (isGuaranteedMixed && i === 0) {
        done = true
      }
      else if (isGuaranteedMixed && i === 1) {
        done = false
      }
      else {
        done = rng() < 0.5
      }
      const completedAt = done ? (isDoneTask ? task.completedAt : task.createdAt) : null
      return {
        taskId: task.id,
        title,
        done,
        position: (i + 1) * 1000,
        createdAt: task.createdAt,
        completedAt,
      }
    })

    await db.insert(schema.checklistItems).values(values)
    checklistItemCount += values.length
  }

  console.log(
    `Seeded ${projectRows.length} projects, ${tagRows.length} tags, ${columnRows.length} columns, ${planned.length} tasks, `
    + `${taskTagCount} task-tag links, ${eventCount} state events, ${checklistItemCount} checklist items.`,
  )
  console.log('Seeded as "owner". Set a password with: pnpm user:passwd owner')

  await client.end()
}

main().catch(async (e) => {
  console.error(e)
  await client.end()
  process.exit(1)
})
