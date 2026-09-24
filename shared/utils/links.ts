import type { TaskLink, TaskLinkType } from '../types/domain'

export function normalizeLink(fromTaskId: string, toTaskId: string, type: TaskLinkType): { fromTaskId: string; toTaskId: string } | null {
  if (fromTaskId === toTaskId) return null
  if (type === 'relates') {
    return fromTaskId < toTaskId
      ? { fromTaskId, toTaskId }
      : { fromTaskId: toTaskId, toTaskId: fromTaskId }
  }
  return { fromTaskId, toTaskId }
}

export interface LinkView { link: TaskLink; otherTaskId: string }

export interface TaskLinkGroups {
  blocks: LinkView[]
  blockedBy: LinkView[]
  relates: LinkView[]
  duplicates: LinkView[]
  duplicatedBy: LinkView[]
}

export function groupLinksForTask(taskId: string, links: TaskLink[]): TaskLinkGroups {
  const groups: TaskLinkGroups = { blocks: [], blockedBy: [], relates: [], duplicates: [], duplicatedBy: [] }

  for (const link of links) {
    if (link.type === 'blocks') {
      if (link.fromTaskId === taskId) groups.blocks.push({ link, otherTaskId: link.toTaskId })
      else if (link.toTaskId === taskId) groups.blockedBy.push({ link, otherTaskId: link.fromTaskId })
    }
    else if (link.type === 'duplicates') {
      if (link.fromTaskId === taskId) groups.duplicates.push({ link, otherTaskId: link.toTaskId })
      else if (link.toTaskId === taskId) groups.duplicatedBy.push({ link, otherTaskId: link.fromTaskId })
    }
    else if (link.type === 'relates') {
      if (link.fromTaskId === taskId) groups.relates.push({ link, otherTaskId: link.toTaskId })
      else if (link.toTaskId === taskId) groups.relates.push({ link, otherTaskId: link.fromTaskId })
    }
  }

  return groups
}

export function isBlocked(taskId: string, links: TaskLink[], isDone: (taskId: string) => boolean): boolean {
  return links.some((link) => link.type === 'blocks' && link.toTaskId === taskId && !isDone(link.fromTaskId))
}
