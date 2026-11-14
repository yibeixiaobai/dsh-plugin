import path from 'node:path'
import type { Config } from '../config.ts'
import { workspaceDir } from '../sync.ts'

/** 安全字符校验，严防路径穿透 */
export function assertSafeIdentifier(id: string, name = '标识符'): string {
  const trimmed = id.trim()
  if (!trimmed || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(trimmed)) {
    throw new Error(`非法${name}: ${id}`)
  }
  return trimmed
}

/** 获取活跃任务沙箱主目录（默认位于当前会话的项目工作区） */
export function activeTasksBaseDir(cfg: Partial<Config> | undefined, workspacePath?: string): string {
  const ws = workspaceDir(cfg, workspacePath)
  return path.join(ws, 'tasks', 'active')
}

/** 获取历史归档主目录（默认位于当前会话的项目工作区） */
export function archiveTasksBaseDir(cfg: Partial<Config> | undefined, workspacePath?: string): string {
  const ws = workspaceDir(cfg, workspacePath)
  return path.join(ws, 'tasks', 'archive')
}

/** 获取指定任务的沙箱根目录（优先落盘在会话所属项目文件夹） */
export function taskSandboxRootDir(cfg: Partial<Config> | undefined, taskId: string, workspacePath?: string): string {
  const safeId = assertSafeIdentifier(taskId, 'taskId')
  return path.join(activeTasksBaseDir(cfg, workspacePath), safeId)
}
