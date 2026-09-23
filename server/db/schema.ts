import {
  boolean,
  date,
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { COLUMN_KINDS } from '../../shared/types/domain'

export const columnKind = pgEnum('column_kind', COLUMN_KINDS)

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('blue'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('slate'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export const boardColumns = pgTable('board_columns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: columnKind('kind').notNull(),
  position: doublePrecision('position').notNull().default(1000),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
})

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description'),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  columnId: uuid('column_id').notNull().references(() => boardColumns.id, { onDelete: 'restrict' }),
  position: doublePrecision('position').notNull().default(1000),
  deadline: date('deadline', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  stateChangedAt: timestamp('state_changed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('tasks_column_id_position_idx').on(t.columnId, t.position),
  index('tasks_project_id_idx').on(t.projectId),
  index('tasks_completed_at_idx').on(t.completedAt),
])

export const taskTags = pgTable('task_tags', {
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.taskId, t.tagId] }),
])

export const checklistItems = pgTable('checklist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  done: boolean('done').notNull().default(false),
  position: doublePrecision('position').notNull().default(1000),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('checklist_items_task_id_position_idx').on(t.taskId, t.position),
])

export const taskStateEvents = pgTable('task_state_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  fromColumnId: uuid('from_column_id').references(() => boardColumns.id, { onDelete: 'set null' }),
  toColumnId: uuid('to_column_id').references(() => boardColumns.id, { onDelete: 'set null' }),
  toKind: columnKind('to_kind').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  index('task_state_events_task_id_changed_at_idx').on(t.taskId, t.changedAt),
])

export const projectsRelations = relations(projects, ({ many }) => ({
  tasks: many(tasks),
}))

export const tagsRelations = relations(tags, ({ many }) => ({
  taskTags: many(taskTags),
}))

export const boardColumnsRelations = relations(boardColumns, ({ many }) => ({
  tasks: many(tasks),
}))

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  column: one(boardColumns, { fields: [tasks.columnId], references: [boardColumns.id] }),
  taskTags: many(taskTags),
  stateEvents: many(taskStateEvents),
  checklistItems: many(checklistItems),
}))

export const checklistItemsRelations = relations(checklistItems, ({ one }) => ({
  task: one(tasks, { fields: [checklistItems.taskId], references: [tasks.id] }),
}))

export const taskTagsRelations = relations(taskTags, ({ one }) => ({
  task: one(tasks, { fields: [taskTags.taskId], references: [tasks.id] }),
  tag: one(tags, { fields: [taskTags.tagId], references: [tags.id] }),
}))

export const taskStateEventsRelations = relations(taskStateEvents, ({ one }) => ({
  task: one(tasks, { fields: [taskStateEvents.taskId], references: [tasks.id] }),
  fromColumn: one(boardColumns, { fields: [taskStateEvents.fromColumnId], references: [boardColumns.id], relationName: 'fromColumnEvents' }),
  toColumn: one(boardColumns, { fields: [taskStateEvents.toColumnId], references: [boardColumns.id], relationName: 'toColumnEvents' }),
}))
