export * from './TabStoreProvider.js'

export function isWorkspaceTab(tab: any): boolean {
  return Boolean(tab && (tab.workspacePath || tab.type === 'workspace'))
}

export interface WorkspaceTabState {
  id?: string
  workspacePath?: string
  workspaceIdentity?: string
  remoteSessionId?: string
  [key: string]: any
}
