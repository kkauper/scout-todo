import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { createUser } from '../../server/db/users'
import * as schema from '../../server/db/schema'

// Vite reserves `process.env.BASE_URL` for its own default ('/') and overwrites it inside test
// workers; vitest.integration.config.ts relays the real value under SCOUT_TEST_BASE_URL instead.
const BASE = process.env.SCOUT_TEST_BASE_URL || 'http://localhost:3000'

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL not set')
}

const client = postgres(url, { max: 1 })
const db = drizzle(client, { schema })

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

interface ApiResult { status: number, json: any }

async function api(cookie: string | undefined, method: string, path: string, body?: unknown): Promise<ApiResult> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: any = null
  if (text) {
    try {
      json = JSON.parse(text)
    }
    catch {
      json = text
    }
  }
  return { status: res.status, json }
}

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (res.status !== 200) throw new Error(`login failed for "${username}": ${res.status}`)
  const setCookie = res.headers.getSetCookie()
  const first = setCookie[0]
  if (!first) throw new Error('no set-cookie header on login response')
  return first.split(';')[0]!
}

const suffix = randomSuffix()
const aliceUsername = `iso-a-${suffix}`
const bobUsername = `iso-b-${suffix}`
const PASSWORD = 'isolation-pass-1'
const NEW_BOB_PASSWORD = 'isolation-pass-2'

let aliceId: string
let bobId: string
let aliceCookie: string
let bobCookie: string

let aliceProjectId: string
let aliceTagId: string
let aliceColumnId: string
let aliceTaskId: string
let aliceChecklistItemId: string
let aliceBoardSnapshot: unknown

let bobColumnId: string

beforeAll(async () => {
  const alice = await createUser(db, aliceUsername, PASSWORD)
  const bob = await createUser(db, bobUsername, PASSWORD)
  aliceId = alice.id
  bobId = bob.id

  aliceCookie = await login(aliceUsername, PASSWORD)
  bobCookie = await login(bobUsername, PASSWORD)

  const projectRes = await api(aliceCookie, 'POST', '/api/projects', { name: `Iso Project ${suffix}` })
  aliceProjectId = projectRes.json.id

  const tagRes = await api(aliceCookie, 'POST', '/api/tags', { name: `iso-tag-${suffix}` })
  aliceTagId = tagRes.json.id

  const columnRes = await api(aliceCookie, 'POST', '/api/columns', { name: `Iso Column ${suffix}`, kind: 'open' })
  aliceColumnId = columnRes.json.id

  const taskRes = await api(aliceCookie, 'POST', '/api/tasks', {
    title: `Iso Task ${suffix}`,
    columnId: aliceColumnId,
    projectId: aliceProjectId,
    tagIds: [aliceTagId],
  })
  aliceTaskId = taskRes.json.id

  const checklistRes = await api(aliceCookie, 'POST', `/api/tasks/${aliceTaskId}/checklist`, { titles: ['Iso item'] })
  aliceChecklistItemId = checklistRes.json[0].id

  const boardRes = await api(aliceCookie, 'GET', '/api/board')
  aliceBoardSnapshot = boardRes.json

  const bobColumnsRes = await api(bobCookie, 'GET', '/api/board')
  bobColumnId = bobColumnsRes.json.columns[0].id
})

afterAll(async () => {
  await client`DELETE FROM users WHERE id IN (${aliceId}, ${bobId})`
  await client.end()
})

describe('multi-user isolation', () => {
  it('1. board does not leak another user\'s data; default columns only', async () => {
    const { status, json } = await api(bobCookie, 'GET', '/api/board')
    expect(status).toBe(200)
    expect(json.projects.map((p: any) => p.id)).not.toContain(aliceProjectId)
    expect(json.tags.map((t: any) => t.id)).not.toContain(aliceTagId)
    expect(json.columns.map((c: any) => c.id)).not.toContain(aliceColumnId)
    expect(json.tasks.map((t: any) => t.id)).not.toContain(aliceTaskId)
    expect(json.columns).toHaveLength(5)
  })

  it('2. kpis does not crash; events for a foreign task 404', async () => {
    const kpis = await api(bobCookie, 'GET', '/api/kpis')
    expect(kpis.status).toBe(200)

    const events = await api(bobCookie, 'GET', `/api/tasks/${aliceTaskId}/events`)
    expect(events.status).toBe(404)
  })

  it('3. mutating another user\'s resources by id 404s', async () => {
    const projectPatch = await api(bobCookie, 'PATCH', `/api/projects/${aliceProjectId}`, { name: 'Hijacked' })
    expect(projectPatch.status).toBe(404)
    const projectDelete = await api(bobCookie, 'DELETE', `/api/projects/${aliceProjectId}`)
    expect(projectDelete.status).toBe(404)

    const tagPatch = await api(bobCookie, 'PATCH', `/api/tags/${aliceTagId}`, { name: 'hijacked' })
    expect(tagPatch.status).toBe(404)
    const tagDelete = await api(bobCookie, 'DELETE', `/api/tags/${aliceTagId}`)
    expect(tagDelete.status).toBe(404)

    const columnPatch = await api(bobCookie, 'PATCH', `/api/columns/${aliceColumnId}`, { name: 'Hijacked' })
    expect(columnPatch.status).toBe(404)
    const columnDelete = await api(bobCookie, 'DELETE', `/api/columns/${aliceColumnId}`)
    expect(columnDelete.status).toBe(404)

    const taskPatch = await api(bobCookie, 'PATCH', `/api/tasks/${aliceTaskId}`, { title: 'Hijacked' })
    expect(taskPatch.status).toBe(404)
    const taskDelete = await api(bobCookie, 'DELETE', `/api/tasks/${aliceTaskId}`)
    expect(taskDelete.status).toBe(404)

    const checklistPatch = await api(bobCookie, 'PATCH', `/api/checklist/${aliceChecklistItemId}`, { done: true })
    expect(checklistPatch.status).toBe(404)
    const checklistDelete = await api(bobCookie, 'DELETE', `/api/checklist/${aliceChecklistItemId}`)
    expect(checklistDelete.status).toBe(404)
  })

  it('4. move and checklist-add on a foreign task 404', async () => {
    const move = await api(bobCookie, 'POST', `/api/tasks/${aliceTaskId}/move`, { columnId: bobColumnId, position: 1000 })
    expect(move.status).toBe(404)

    const checklist = await api(bobCookie, 'POST', `/api/tasks/${aliceTaskId}/checklist`, { titles: ['x'] })
    expect(checklist.status).toBe(404)
  })

  it('5. creating a task referencing another user\'s ids 400s', async () => {
    const byColumn = await api(bobCookie, 'POST', '/api/tasks', { title: 'x', columnId: aliceColumnId })
    expect(byColumn.status).toBe(400)

    const byProject = await api(bobCookie, 'POST', '/api/tasks', { title: 'x', projectId: aliceProjectId })
    expect(byProject.status).toBe(400)

    const byTag = await api(bobCookie, 'POST', '/api/tasks', { title: 'x', tagIds: [aliceTagId] })
    expect(byTag.status).toBe(400)
  })

  it('6. patch/move/delete referencing another user\'s ids on own resources 400s', async () => {
    const ownTask = await api(bobCookie, 'POST', '/api/tasks', { title: `Bob task ${suffix}`, columnId: bobColumnId })
    expect(ownTask.status).toBe(200)
    const bobTaskId = ownTask.json.id

    const patch = await api(bobCookie, 'PATCH', `/api/tasks/${bobTaskId}`, { projectId: aliceProjectId })
    expect(patch.status).toBe(400)

    const move = await api(bobCookie, 'POST', `/api/tasks/${bobTaskId}/move`, { columnId: aliceColumnId, position: 1000 })
    expect(move.status).toBe(400)

    const ownColumn = await api(bobCookie, 'POST', '/api/columns', { name: `Bob column ${suffix}`, kind: 'open' })
    expect(ownColumn.status).toBe(200)
    const bobOwnColumnId = ownColumn.json.id

    const moveTaskIntoColumn = await api(bobCookie, 'POST', `/api/tasks/${bobTaskId}/move`, { columnId: bobOwnColumnId, position: 1000 })
    expect(moveTaskIntoColumn.status).toBe(200)

    const deleteWithForeignMoveTo = await api(bobCookie, 'DELETE', `/api/columns/${bobOwnColumnId}?moveTo=${aliceColumnId}`)
    expect(deleteWithForeignMoveTo.status).toBe(400)
  })

  it('7. project names are unique per user, not globally', async () => {
    const res = await api(bobCookie, 'POST', '/api/projects', { name: `Iso Project ${suffix}` })
    expect(res.status).toBe(200)
  })

  it('8. password change is scoped to the authenticated user', async () => {
    const wrongCurrent = await api(bobCookie, 'POST', '/api/auth/password', { currentPassword: 'not-the-password', newPassword: NEW_BOB_PASSWORD })
    expect(wrongCurrent.status).toBe(400)

    const ok = await api(bobCookie, 'POST', '/api/auth/password', { currentPassword: PASSWORD, newPassword: NEW_BOB_PASSWORD })
    expect(ok.status).toBe(200)

    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: bobUsername, password: NEW_BOB_PASSWORD }),
    })
    expect(res.status).toBe(200)
  })

  it('9. alice\'s board is unchanged by any of the above', async () => {
    const { json } = await api(aliceCookie, 'GET', '/api/board')
    expect(json).toEqual(aliceBoardSnapshot)
  })
})
