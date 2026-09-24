import { and, asc, eq } from 'drizzle-orm'
import type { BoardColumn, ChecklistItem, ColorKey, Project, Tag, Task, TaskLink, TaskLinkType } from '#shared/types/domain'
import * as schema from '../db/schema'
import type { useDb } from './db'

type ProjectRow = typeof schema.projects.$inferSelect
type TagRow = typeof schema.tags.$inferSelect
type BoardColumnRow = typeof schema.boardColumns.$inferSelect
type TaskRow = typeof schema.tasks.$inferSelect
type ChecklistItemRow = typeof schema.checklistItems.$inferSelect
type TaskLinkRow = typeof schema.taskLinks.$inferSelect

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color as ColorKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color as ColorKey,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toColumn(row: BoardColumnRow): BoardColumn {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    position: row.position,
    hidden: row.hidden,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toChecklistItem(row: ChecklistItemRow): ChecklistItem {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    done: row.done,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  }
}

export function toTask(row: TaskRow, tagIds: string[], checklist: ChecklistItem[] = []): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    projectId: row.projectId ?? null,
    columnId: row.columnId,
    position: row.position,
    deadline: row.deadline ?? null,
    size: row.size ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    stateChangedAt: row.stateChangedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    tagIds,
    checklist,
  }
}

export function toTaskLink(row: TaskLinkRow): TaskLink {
  return {
    id: row.id,
    fromTaskId: row.fromTaskId,
    toTaskId: row.toTaskId,
    type: row.type as TaskLinkType,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function loadTaskDto(db: ReturnType<typeof useDb>, userId: string, id: string): Promise<Task | null> {
  const row = await db.query.tasks.findFirst({ where: and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)) })
  if (!row) return null
  const [tagRows, checklistRows] = await Promise.all([
    db
      .select({ tagId: schema.taskTags.tagId })
      .from(schema.taskTags)
      .where(eq(schema.taskTags.taskId, id)),
    db
      .select()
      .from(schema.checklistItems)
      .where(eq(schema.checklistItems.taskId, id))
      .orderBy(asc(schema.checklistItems.position)),
  ])
  return toTask(row, tagRows.map(t => t.tagId), checklistRows.map(toChecklistItem))
}
