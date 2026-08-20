export interface WorkspaceViewLike {
  readonly workspaceId?: string
  readonly path?: string
  readonly sessionIds?: readonly string[]
}

export interface WorkspaceListLike {
  readonly items?: readonly WorkspaceViewLike[]
  readonly recentWorkspaceId?: string
}

export function currentWorkspacePath(input: {
  workspaces?: { list?: { getSnapshot?: () => WorkspaceListLike } }
  sessions?: { list?: { getSnapshot?: () => { current?: string } } }
}): string | undefined {
  const snapshot = input.workspaces?.list?.getSnapshot?.()
  const items = snapshot?.items ?? []
  const currentSession = input.sessions?.list?.getSnapshot?.()?.current
  const current = currentSession
    ? items.find(item => item.sessionIds?.includes(currentSession))
    : undefined
  const recent = snapshot?.recentWorkspaceId
    ? items.find(item => item.workspaceId === snapshot.recentWorkspaceId)
    : undefined
  const path = current?.path ?? recent?.path ?? items[0]?.path
  return typeof path === 'string' && path.trim() ? path : undefined
}
