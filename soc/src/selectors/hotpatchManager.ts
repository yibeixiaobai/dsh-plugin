import fs from 'node:fs'
import path from 'node:path'

export interface SelectorPatchEntry {
  platform: string
  version?: string
  patchDate?: string
  selectors?: Record<string, string | string[]>
  urls?: Record<string, string>
}

/**
 * 平台选择器热补丁与覆盖管理器
 * 优先级：运行时内存热补丁 > 本地工作区 selectors_override.json > 出厂默认内置选择器
 */
export class HotpatchManager {
  private static instance: HotpatchManager
  private readonly patches = new Map<string, SelectorPatchEntry>()

  static getInstance(): HotpatchManager {
    if (!HotpatchManager.instance) {
      HotpatchManager.instance = new HotpatchManager()
    }
    return HotpatchManager.instance
  }

  /**
   * 从当前工作区读取自定义选择器覆盖配置
   */
  loadLocalOverrides(workspacePath?: string): void {
    if (!workspacePath) return
    const candidatePaths = [
      path.join(workspacePath, 'config', 'selectors_override.json'),
      path.join(workspacePath, '.social-publisher', 'selectors_override.json'),
      path.join(workspacePath, 'selectors_override.json'),
    ]

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
          const list: SelectorPatchEntry[] = Array.isArray(raw) ? raw : [raw]
          for (const item of list) {
            if (item && typeof item === 'object' && item.platform) {
              this.applyHotpatch(item)
            }
          }
          console.log(`[HotpatchManager] 已成功从 [${p}] 加载本地选择器覆盖`)
          break
        } catch (err) {
          console.warn(`[HotpatchManager] 读取本地选择器覆盖文件 [${p}] 异常:`, err)
        }
      }
    }
  }

  /**
   * 应用热补丁规则（内存热生效）
   */
  applyHotpatch(patch: SelectorPatchEntry): boolean {
    if (!patch || !patch.platform) return false
    const norm = patch.platform.toLowerCase().trim()
    const existing = this.patches.get(norm) || { platform: norm }
    this.patches.set(norm, {
      ...existing,
      ...patch,
      selectors: {
        ...(existing.selectors || {}),
        ...(patch.selectors || {}),
      },
      urls: {
        ...(existing.urls || {}),
        ...(patch.urls || {}),
      },
    })
    return true
  }

  /**
   * 获取生效的选择器，支持点号路径寻址（如 'publish.titleInput'）
   */
  getEffectiveSelector<T extends string | string[] = string>(
    platform: string,
    keyPath: string,
    defaultSelector: T,
  ): T {
    const norm = platform.toLowerCase().trim()
    const patch = this.patches.get(norm)
    if (patch?.selectors && patch.selectors[keyPath] !== undefined) {
      return patch.selectors[keyPath] as T
    }
    return defaultSelector
  }

  /**
   * 获取生效的平台 URL
   */
  getEffectiveUrl(platform: string, urlKey: string, defaultUrl: string): string {
    const norm = platform.toLowerCase().trim()
    const patch = this.patches.get(norm)
    if (patch?.urls && patch.urls[urlKey] !== undefined) {
      return patch.urls[urlKey] as string
    }
    return defaultUrl
  }

  /**
   * 清空所有热补丁
   */
  clear(): void {
    this.patches.clear()
  }
}

export const hotpatchManager = HotpatchManager.getInstance()
