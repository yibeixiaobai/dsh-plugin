/**
 * 任务沙箱媒体资源与预览寻址切片 (Sandboxed Media Resolver)
 * 职责：负责将任务沙箱内的相对/绝对物料路径解析为安全的本地预览 URL，并计算微光骨架屏状态
 */

import { buildLocalMediaPreviewUrl } from '../../../compat/types.js'

export interface MediaResolutionParams {
  rawUrlOrPath?: string
  workspacePath?: string
  workspaceIdentity?: string
  sessionId?: string
  scriptsDir?: string
}

/**
 * 将物料路径解析为可供前端高保真渲染的安全预览 URL
 */
export function resolveSafeMediaPreviewUrl(params: MediaResolutionParams): string | undefined {
  const { rawUrlOrPath } = params
  if (!rawUrlOrPath || typeof rawUrlOrPath !== 'string') return undefined

  // 已经是网络图片或 Base64 Data URL
  if (
    rawUrlOrPath.startsWith('http://') ||
    rawUrlOrPath.startsWith('https://') ||
    rawUrlOrPath.startsWith('data:image/') ||
    rawUrlOrPath.startsWith('blob:')
  ) {
    return rawUrlOrPath
  }

  // 本地文件系统路径转本地媒体 RPC 预览 URL
  return buildLocalMediaPreviewUrl(rawUrlOrPath)
}

/**
 * 判断图片槽位是否正处于微光生成中
 */
export function isMediaSlotPending(status?: string, hasImage?: boolean): boolean {
  if (hasImage) return false
  return status === 'planned' || status === 'generating' || status === 'pending'
}
